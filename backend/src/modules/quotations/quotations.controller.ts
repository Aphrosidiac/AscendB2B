import type { FastifyInstance } from 'fastify';
import type { Quotation } from '@prisma/client';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { generateQuoteNumber } from '../../utils/quote-number.js';
import { generateOrderNumber } from '../../utils/order-number.js';

const quotationItemInputSchema = z.object({
  variantId: z.string().optional(),
  kitId: z.string().optional(),
  quantity: z.number().int().min(1).max(100000),
}).superRefine((v, ctx) => {
  // variantId XOR kitId — same mutual-exclusivity convention as OrderItem.
  if (!!v.variantId === !!v.kitId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Exactly one of variantId or kitId must be set' });
  }
});

const requestQuotationSchema = z.object({
  validUntil: z.string().datetime().optional(),
  items: z.array(quotationItemInputSchema).min(1).max(50),
});

// Field extraction mirrors orders.controller.ts's isOrderNumberConflict —
// duplicated locally rather than imported since that file is mid-rework by
// a parallel agent and not a stable place to import from right now.
function isNumberFieldConflict(err: unknown, field: string): boolean {
  const meta = (err as { meta?: { target?: string | string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } })?.meta;
  const fields = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  return Array.isArray(fields) ? fields.includes(field) : typeof fields === 'string' && fields.includes(field);
}

const DEFAULT_VALIDITY_DAYS = 30;

// Shared item include for every quotation read path — resolves each line's
// display name (product/kit) so the frontend never has to cross-reference a
// separate catalog fetch just to render a quote.
const QUOTATION_ITEM_INCLUDE = {
  items: {
    include: {
      variant: { select: { code: true, size: true, imageUrl: true, product: { select: { name: true } } } },
      kit: { select: { name: true } },
    },
  },
} as const;

export async function requestQuotation(fastify: FastifyInstance, companyId: string, body: unknown) {
  const data = requestQuotationSchema.parse(body);

  const variantIds = [...new Set(data.items.filter((i) => i.variantId).map((i) => i.variantId!))];
  const kitIds = [...new Set(data.items.filter((i) => i.kitId).map((i) => i.kitId!))];

  const [variants, kits, company] = await Promise.all([
    variantIds.length ? fastify.prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true } }) : Promise.resolve([]),
    kitIds.length ? fastify.prisma.kit.findMany({ where: { id: { in: kitIds } }, select: { id: true } }) : Promise.resolve([]),
    fastify.prisma.company.findUnique({ where: { id: companyId }, select: { contactName: true } }),
  ]);

  const foundVariantIds = new Set(variants.map((v) => v.id));
  const foundKitIds = new Set(kits.map((k) => k.id));
  for (const item of data.items) {
    if (item.variantId && !foundVariantIds.has(item.variantId)) {
      throw { statusCode: 400, message: `Product variant ${item.variantId} not found` };
    }
    if (item.kitId && !foundKitIds.has(item.kitId)) {
      throw { statusCode: 400, message: `Kit ${item.kitId} not found` };
    }
  }

  const validUntil = data.validUntil
    ? new Date(data.validUntil)
    : new Date(Date.now() + DEFAULT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const quoteNumber = await generateQuoteNumber(tx);
        return tx.quotation.create({
          data: {
            quoteNumber,
            companyId,
            status: 'DRAFT',
            validUntil,
            // No admin/rep is attached yet at request time — the company's own
            // contact name is the best available placeholder until an admin
            // picks this up and (implicitly, by editing/sending it) owns it.
            createdBy: company?.contactName ?? 'Company self-service request',
            // unitPrice starts at 0 — admin fills in the real negotiated price
            // before sending. Not tied to PriceTier in this pass.
            items: {
              create: data.items.map((i) => ({
                variantId: i.variantId,
                kitId: i.kitId,
                quantity: i.quantity,
                unitPrice: 0,
              })),
            },
          },
          include: QUOTATION_ITEM_INCLUDE,
        });
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002' && attempt < MAX_ATTEMPTS && isNumberFieldConflict(err, 'quoteNumber')) continue;
      throw err;
    }
  }
}

export async function listMyQuotations(fastify: FastifyInstance, companyId: string, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = { companyId };
  if (query.status) where.status = query.status;

  const [quotations, total] = await Promise.all([
    fastify.prisma.quotation.findMany({
      where,
      include: QUOTATION_ITEM_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.quotation.count({ where }),
  ]);

  return paginatedResponse(quotations, total, page, limit);
}

async function requireOwnQuotation(fastify: FastifyInstance, companyId: string, id: string) {
  const quotation = await fastify.prisma.quotation.findUnique({
    where: { id },
    include: QUOTATION_ITEM_INCLUDE,
  });
  if (!quotation || quotation.companyId !== companyId) {
    throw { statusCode: 404, message: 'Quotation not found' };
  }
  return quotation;
}

export async function getMyQuotation(fastify: FastifyInstance, companyId: string, id: string) {
  return requireOwnQuotation(fastify, companyId, id);
}

const acceptQuotationSchema = z.object({
  shippingAddressId: z.string().optional(),
});

/**
 * Shared ACCEPTED-transition logic — validates status/expiry, resolves a
 * shipping address, and atomically converts the quotation into an Order.
 * Used by both the company's own accept endpoint and the admin status
 * endpoint, so "transitioning to ACCEPTED creates the order" can't drift
 * between the two call sites.
 */
export async function finalizeAcceptQuotation(
  fastify: FastifyInstance,
  quotation: Pick<Quotation, 'id' | 'companyId' | 'status' | 'validUntil' | 'subtotal' | 'total'>,
  requestedShippingAddressId?: string
) {
  if (quotation.status === 'EXPIRED') {
    throw { statusCode: 400, message: 'This quotation has expired' };
  }
  if (quotation.status !== 'SENT') {
    throw { statusCode: 400, message: `Only a SENT quotation can be accepted (current status: ${quotation.status})` };
  }
  if (quotation.validUntil.getTime() < Date.now()) {
    // Lazily flip instead of leaving a past-due row sitting as SENT.
    await fastify.prisma.quotation.update({ where: { id: quotation.id }, data: { status: 'EXPIRED' } });
    throw { statusCode: 400, message: 'This quotation has expired' };
  }

  const addresses = await fastify.prisma.companyAddress.findMany({ where: { companyId: quotation.companyId } });
  if (addresses.length === 0) {
    throw { statusCode: 400, message: 'No saved address for this company yet — create a shipping address before accepting a quotation' };
  }

  let shippingAddressId = requestedShippingAddressId;
  if (shippingAddressId) {
    if (!addresses.some((a) => a.id === shippingAddressId)) {
      throw { statusCode: 400, message: 'shippingAddressId does not belong to this company' };
    }
  } else if (addresses.length === 1) {
    shippingAddressId = addresses[0].id;
  } else {
    throw { statusCode: 400, message: 'This company has multiple saved addresses — specify shippingAddressId' };
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const items = await tx.quotationItem.findMany({ where: { quotationId: quotation.id } });
        const orderNumber = await generateOrderNumber(tx);

        const order = await tx.order.create({
          data: {
            orderNumber,
            companyId: quotation.companyId,
            quotationId: quotation.id,
            shippingAddressId: shippingAddressId!,
            subtotal: quotation.subtotal,
            shippingFee: 0,
            discountAmount: 0,
            total: quotation.total,
            status: 'PENDING',
            items: {
              create: items.map((i) => ({
                variantId: i.variantId,
                kitId: i.kitId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
              })),
            },
          },
          include: { items: true },
        });

        await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'ACCEPTED' } });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: 'PENDING', note: `Created from accepted quotation ${quotation.id}` },
        });

        return order;
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002' && attempt < MAX_ATTEMPTS && isNumberFieldConflict(err, 'orderNumber')) continue;
      throw err;
    }
  }
}

export async function acceptMyQuotation(fastify: FastifyInstance, companyId: string, id: string, body: unknown) {
  const { shippingAddressId } = acceptQuotationSchema.parse(body ?? {});
  const quotation = await requireOwnQuotation(fastify, companyId, id);
  return finalizeAcceptQuotation(fastify, quotation, shippingAddressId);
}

export async function rejectMyQuotation(fastify: FastifyInstance, companyId: string, id: string) {
  const quotation = await requireOwnQuotation(fastify, companyId, id);
  if (quotation.status !== 'SENT') {
    throw { statusCode: 400, message: `Only a SENT quotation can be rejected (current status: ${quotation.status})` };
  }
  return fastify.prisma.quotation.update({ where: { id }, data: { status: 'REJECTED' } });
}
