import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { finalizeAcceptQuotation } from '../quotations/quotations.controller.js';
import { generateQuotationPdf } from '../../utils/quotation-pdf.js';

export async function adminListQuotations(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.companyId) where.companyId = query.companyId;

  const [quotations, total] = await Promise.all([
    fastify.prisma.quotation.findMany({
      where,
      include: { items: true, company: { select: { username: true, id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.quotation.count({ where }),
  ]);

  return paginatedResponse(quotations, total, page, limit);
}

// Mirrors the company-side QUOTATION_ITEM_INCLUDE — without the variant/kit
// relations the admin UI has only a bare variantId to render, which showed
// up as a generic "Item" row on the quotation detail page.
async function requireQuotation(fastify: FastifyInstance, id: string) {
  const quotation = await fastify.prisma.quotation.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          variant: { select: { code: true, size: true, imageUrl: true, product: { select: { name: true } } } },
          kit: { select: { name: true } },
        },
      },
      company: { select: { username: true, id: true, name: true, contactName: true, phone: true, email: true } },
    },
  });
  if (!quotation) throw { statusCode: 404, message: 'Quotation not found' };
  return quotation;
}

export async function adminGetQuotation(fastify: FastifyInstance, id: string) {
  return requireQuotation(fastify, id);
}

export async function adminGetQuotationPdf(fastify: FastifyInstance, id: string) {
  const quotation = await requireQuotation(fastify, id);
  const settingsRows = await fastify.prisma.setting.findMany();
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));
  const pdf = await generateQuotationPdf(quotation, settings);
  return { quotation, pdf };
}

const quotationItemSchema = z.object({
  // Present = update this existing item; absent = create a new one. Any
  // existing item not present in the submitted array gets deleted — same
  // full-replace convention as admin-products.controller.ts's variants array.
  id: z.string().optional(),
  variantId: z.string().optional(),
  kitId: z.string().optional(),
  quantity: z.number().int().min(1).max(100000),
  unitPrice: z.number().int().min(0),
}).superRefine((v, ctx) => {
  if (!!v.variantId === !!v.kitId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Exactly one of variantId or kitId must be set' });
  }
});

const adminUpdateQuotationSchema = z.object({
  validUntil: z.string().datetime().optional(),
  createdBy: z.string().optional(),
  items: z.array(quotationItemSchema).min(1).optional(),
});

// Admin edits pricing/quantities/items and validUntil/createdBy. Recomputes
// subtotal/total from the items every time items are touched — there is no
// separate shipping/discount concept on Quotation, so total === subtotal
// here (Order.shippingFee/discountAmount are only applied later, at
// quote-acceptance time).
export async function adminUpdateQuotation(fastify: FastifyInstance, id: string, body: unknown) {
  const data = adminUpdateQuotationSchema.parse(body);
  const existing = await requireQuotation(fastify, id);

  if (existing.status !== 'DRAFT' && existing.status !== 'SENT') {
    throw { statusCode: 400, message: `Cannot edit a quotation with status ${existing.status}` };
  }

  return fastify.prisma.$transaction(async (tx) => {
    if (data.items) {
      const existingIds = new Set(existing.items.map((i) => i.id));
      const submittedIds = new Set(data.items.filter((i) => i.id).map((i) => i.id!));

      for (const item of data.items) {
        if (item.id) {
          if (!existingIds.has(item.id)) {
            throw { statusCode: 400, message: `Item ${item.id} does not belong to this quotation` };
          }
          await tx.quotationItem.update({
            where: { id: item.id },
            data: { variantId: item.variantId ?? null, kitId: item.kitId ?? null, quantity: item.quantity, unitPrice: item.unitPrice },
          });
        } else {
          await tx.quotationItem.create({
            data: { quotationId: id, variantId: item.variantId, kitId: item.kitId, quantity: item.quantity, unitPrice: item.unitPrice },
          });
        }
      }

      const removedIds = [...existingIds].filter((eid) => !submittedIds.has(eid));
      if (removedIds.length > 0) {
        await tx.quotationItem.deleteMany({ where: { id: { in: removedIds } } });
      }
    }

    const subtotal = data.items
      ? data.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
      : undefined;

    return tx.quotation.update({
      where: { id },
      data: {
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        createdBy: data.createdBy,
        subtotal,
        total: subtotal,
      },
      include: { items: true },
    });
  });
}

export async function adminSendQuotation(fastify: FastifyInstance, id: string) {
  const existing = await requireQuotation(fastify, id);
  if (existing.status !== 'DRAFT') {
    throw { statusCode: 400, message: `Only a DRAFT quotation can be sent (current status: ${existing.status})` };
  }
  return fastify.prisma.quotation.update({ where: { id }, data: { status: 'SENT' } });
}

const adminStatusSchema = z.object({
  status: z.enum(['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  // Only relevant when status is ACCEPTED — see finalizeAcceptQuotation.
  shippingAddressId: z.string().optional(),
});

export async function adminSetQuotationStatus(fastify: FastifyInstance, id: string, body: unknown) {
  const { status, shippingAddressId } = adminStatusSchema.parse(body);
  const existing = await requireQuotation(fastify, id);

  if (status === 'ACCEPTED') {
    return finalizeAcceptQuotation(fastify, existing, shippingAddressId);
  }
  if (status === 'SENT') {
    if (existing.status !== 'DRAFT') {
      throw { statusCode: 400, message: `Only a DRAFT quotation can be sent (current status: ${existing.status})` };
    }
  } else if (status === 'REJECTED') {
    if (existing.status !== 'SENT') {
      throw { statusCode: 400, message: `Only a SENT quotation can be rejected (current status: ${existing.status})` };
    }
  }

  return fastify.prisma.quotation.update({ where: { id }, data: { status } });
}
