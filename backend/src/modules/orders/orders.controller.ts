import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateOrderNumber } from '../../utils/order-number.js';
import { generateInvoiceNumber } from '../../utils/invoice-number.js';
import { getActiveGateway } from '../../utils/payment-gateway.js';
import { validateDiscountCode } from '../admin/admin-discounts.controller.js';
import { getTieredUnitPrice } from '../../utils/product-pricing.js';
import { getVariantDisplayName } from '../../utils/product-addons.js';
import { enqueueEmail } from '../../utils/email-outbox.js';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { assertProfileComplete } from '../companies/companies.controller.js';
import { BATCH_SELLABLE_STATUSES, PUBLIC_KIT_WHERE } from '../../utils/kit-availability.js';

const orderItemInputSchema = z.object({
  variantId: z.string().optional(),
  kitId: z.string().optional(),
  quantity: z.number().int().min(1).max(100000),
}).superRefine((v, ctx) => {
  // variantId XOR kitId — same mutual-exclusivity convention as QuotationItem.
  if (!!v.variantId === !!v.kitId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Exactly one of variantId or kitId must be set' });
  }
});

const createOrderSchema = z.object({
  shippingAddressId: z.string(),
  notes: z.string().optional(),
  discountCode: z.string().optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
  // Attach an immediate online-gateway payment to this order (see decision #3
  // in the task brief) — omitted/false means the order is billed later,
  // against the company's credit terms, when it ships.
  payNow: z.boolean().optional(),
  items: z.array(orderItemInputSchema).min(1).max(50),
});

// P2002 field extraction mirrors error-handler.ts / quotations.controller.ts:
// the driver-adapter build reports the violated constraint under
// meta.driverAdapterError, not meta.target.
function isFieldConflict(err: unknown, field: string): boolean {
  const meta = (err as { meta?: { target?: string | string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } })?.meta;
  const fields = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  return Array.isArray(fields) ? fields.includes(field) : typeof fields === 'string' && fields.includes(field);
}

export async function createOrder(fastify: FastifyInstance, companyId: string, body: unknown) {
  const data = createOrderSchema.parse(body);

  // Idempotency: a network retry of a request the server already committed must
  // NOT create a second order. Return the original order instead. The unique
  // constraint is global, but this endpoint is company-scoped, so a match
  // belonging to a different company means two callers collided on the same
  // key — that's a caller bug, not something to silently paper over by
  // handing back someone else's order.
  if (data.idempotencyKey) {
    const existing = await fastify.prisma.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
    if (existing) {
      if (existing.companyId !== companyId) {
        throw { statusCode: 409, message: 'This idempotency key was already used by another request' };
      }
      return { order: existing };
    }
  }

  const company = await fastify.prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw { statusCode: 404, message: 'Company not found' };
  }
  // Blocks ordering until the business profile is filled in. Enforced here
  // rather than only in the checkout UI: `name` is the bill-to line on the
  // invoice, and contactName/phone go straight into the gateway bill payload.
  assertProfileComplete(company);

  // Credit is approval-gated. Everyone signs up on PREPAID; an admin raising
  // creditTerms off PREPAID (admin-companies.controller) IS the approval, so
  // a PREPAID account settling later would be extending itself credit nobody
  // granted. Enforced here, not only by the greyed-out option at checkout —
  // payNow is a plain request field a client can simply omit.
  if (!data.payNow && company.creditTerms === 'PREPAID') {
    throw {
      statusCode: 422,
      message:
        'This account is on prepaid terms, so orders must be paid at checkout. Credit terms are available on approval — contact us to apply.',
    };
  }

  const address = await fastify.prisma.companyAddress.findUnique({ where: { id: data.shippingAddressId } });
  if (!address || address.companyId !== companyId) {
    throw { statusCode: 400, message: 'shippingAddressId does not belong to this company' };
  }

  const runCreateTransaction = () =>
    fastify.prisma.$transaction(async (tx) => {
      // Server-side enforcement of "required" add-ons (e.g. Bac Water +
      // syringes for a reconstitution-needing peptide): the storefront
      // pre-checks and locks these, but a bypassed/buggy client must still
      // not be able to order a peptide without its required supplies.
      // Required add-ons are configured on the parent Product and only apply
      // to plain-variant lines — a kit is a pre-composed bundle, unrelated to
      // ProductAddOn.
      const variantItemIds = data.items.filter((i) => i.variantId).map((i) => i.variantId!);
      const purchasedVariants = variantItemIds.length
        ? await tx.productVariant.findMany({ where: { id: { in: variantItemIds } }, select: { id: true, productId: true } })
        : [];
      const parentIds = [...new Set(purchasedVariants.map((v) => v.productId))];
      const requiredRelations = parentIds.length
        ? await tx.productAddOn.findMany({
            where: { productId: { in: parentIds }, required: true, addOn: { active: true, product: { active: true } } },
          })
        : [];
      const requiredMinByAddOnId = new Map<string, number>();
      for (const rel of requiredRelations) {
        requiredMinByAddOnId.set(rel.addOnId, Math.max(requiredMinByAddOnId.get(rel.addOnId) ?? 0, rel.quantity));
      }
      const items = data.items.map((i) => ({ ...i }));
      for (const [addOnId, minQuantity] of requiredMinByAddOnId) {
        const existingItem = items.find((i) => i.variantId === addOnId);
        if (existingItem) {
          existingItem.quantity = Math.max(existingItem.quantity, minQuantity);
        } else {
          items.push({ variantId: addOnId, quantity: minQuantity });
        }
      }

      const allVariantIds = [...new Set(items.filter((i) => i.variantId).map((i) => i.variantId!))];
      const kitIds = [...new Set(items.filter((i) => i.kitId).map((i) => i.kitId!))];

      const [variants, kits] = await Promise.all([
        allVariantIds.length
          ? tx.productVariant.findMany({
              where: { id: { in: allVariantIds }, active: true, product: { active: true } },
              include: { product: { select: { name: true } }, priceTiers: true },
            })
          : Promise.resolve([]),
        kitIds.length
          // PUBLIC_KIT_WHERE, not just `active` — a kit belonging to a campaign
          // that has since closed must stop being orderable even for someone
          // holding its id from when the campaign was open.
          ? tx.kit.findMany({ where: { id: { in: kitIds }, ...PUBLIC_KIT_WHERE }, include: { items: true } })
          : Promise.resolve([]),
      ]);

      const variantMap = new Map(variants.map((v) => [v.id, v]));
      const kitMap = new Map(kits.map((k) => [k.id, k]));

      for (const item of items) {
        if (item.variantId && !variantMap.has(item.variantId)) {
          throw { statusCode: 400, message: `Product variant ${item.variantId} not found or inactive` };
        }
        if (item.kitId && !kitMap.has(item.kitId)) {
          throw { statusCode: 400, message: `Kit ${item.kitId} is no longer available (inactive, or its pre-order campaign has closed)` };
        }
      }

      // Stock check (sanity-check only — nothing is reserved/decremented
      // here; see rule #1: actual decrement happens at ShipmentItem
      // creation). A variant with NO batches at all falls back to the legacy
      // flat ProductVariant.stock field — mixed catalog, some SKUs are
      // batch/campaign-driven, some are simple always-available items.
      const neededVariantIds = new Set<string>(allVariantIds);
      for (const kitId of kitIds) {
        for (const ki of kitMap.get(kitId)!.items) neededVariantIds.add(ki.variantId);
      }
      const batchSums = neededVariantIds.size
        ? await tx.batch.groupBy({
            by: ['variantId'],
            where: { variantId: { in: [...neededVariantIds] }, status: { in: [...BATCH_SELLABLE_STATUSES] } },
            _sum: { quantity: true },
          })
        : [];
      // A variant with at least one batch row (even one summing to 0, fully
      // depleted) is batch-driven — only a variant with NO rows at all falls
      // back to the flat stock field.
      const batchRowVariantIds = new Set(batchSums.map((b) => b.variantId));
      const availableByVariant = new Map(batchSums.map((b) => [b.variantId, b._sum.quantity ?? 0]));

      function available(variantId: string, fallbackStock: number): number {
        if (batchRowVariantIds.has(variantId)) return availableByVariant.get(variantId) ?? 0;
        return fallbackStock;
      }

      for (const item of items) {
        if (item.variantId) {
          const variant = variantMap.get(item.variantId)!;
          if (item.quantity < variant.moq) {
            throw { statusCode: 400, message: `${getVariantDisplayName(variant.product, variant)} has a minimum order quantity of ${variant.moq}` };
          }
          const avail = available(item.variantId, variant.stock);
          if (avail < item.quantity) {
            throw { statusCode: 400, message: `Insufficient stock for ${getVariantDisplayName(variant.product, variant)} (requested ${item.quantity}, available ${avail})` };
          }
        } else if (item.kitId) {
          const kit = kitMap.get(item.kitId)!;
          for (const ki of kit.items) {
            const required = ki.quantity * item.quantity;
            const componentVariant = variantMap.get(ki.variantId);
            const fallbackStock = componentVariant?.stock ?? 0;
            const avail = available(ki.variantId, fallbackStock);
            if (avail < required) {
              throw { statusCode: 400, message: `Insufficient stock for "${kit.name}" — one of its components is short (requested ${required}, available ${avail})` };
            }
          }
        }
      }

      const now = new Date();
      const subtotal = items.reduce((sum, item) => {
        if (item.variantId) {
          return sum + getTieredUnitPrice(variantMap.get(item.variantId)!, item.quantity, now) * item.quantity;
        }
        return sum + kitMap.get(item.kitId!)!.pricePerKit * item.quantity;
      }, 0);

      const shippingSetting = await tx.setting.findUnique({ where: { key: 'shipping_fee' } });
      const shippingParsed = shippingSetting ? parseFloat(shippingSetting.value) : 0;
      const shippingFee = Number.isFinite(shippingParsed) && shippingParsed > 0 ? Math.round(shippingParsed * 100) : 0;

      let discountAmount = 0;
      let discountCodeId: string | undefined;
      if (data.discountCode) {
        const result = await validateDiscountCode(fastify, data.discountCode, subtotal);
        discountAmount = result.discountAmount;
        discountCodeId = result.discount.id;
        if (result.discount.maxUses != null) {
          const reserved = await tx.discountCode.updateMany({
            where: { id: discountCodeId, usedCount: { lt: result.discount.maxUses } },
            data: { usedCount: { increment: 1 } },
          });
          if (reserved.count === 0) {
            throw { statusCode: 400, message: 'This discount code has reached its usage limit' };
          }
        } else {
          await tx.discountCode.update({ where: { id: discountCodeId }, data: { usedCount: { increment: 1 } } });
        }
      }

      const total = Math.max(subtotal + shippingFee - discountAmount, 0);
      const orderNumber = await generateOrderNumber(tx);

      const created = await tx.order.create({
        data: {
          orderNumber,
          companyId,
          shippingAddressId: data.shippingAddressId,
          subtotal,
          shippingFee,
          discountAmount,
          discountCodeId,
          total,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
          items: {
            create: items.map((item) => ({
              variantId: item.variantId,
              kitId: item.kitId,
              quantity: item.quantity,
              unitPrice: item.variantId
                ? getTieredUnitPrice(variantMap.get(item.variantId)!, item.quantity, now)
                : kitMap.get(item.kitId!)!.pricePerKit,
            })),
          },
        },
        include: { items: true },
      });

      await tx.orderStatusHistory.create({ data: { orderId: created.id, status: 'PENDING' } });

      // Same-transaction outbox insert — the confirmation email exists iff
      // the order does. Actual sending happens in the background email worker.
      await enqueueEmail(tx, created, 'ORDER_CONFIRMATION', company.email);

      // Pay-now: create the Invoice now (so it commits atomically with the
      // order), but with NO InvoiceItems — see decision #3. A real Invoice
      // for this order's line items can only be raised once something has
      // actually shipped (InvoiceItem.shipmentItemId is required+unique), and
      // nothing has at order-creation time. `total` is set directly instead.
      // `created.prepaidInvoiceId` links back to it so the email worker and
      // admin invoice generation can find "the payment for this order"
      // directly instead of guessing — see Invoice.prepaidForOrder in the
      // schema for why this is a one-off link rather than the general
      // Invoice-belongs-to-Company shape.
      let invoice: { id: string; invoiceNumber: string } | undefined;
      if (data.payNow) {
        const invoiceNumber = await generateInvoiceNumber(tx);
        invoice = await tx.invoice.create({
          data: { invoiceNumber, companyId, issueDate: now, dueDate: now, total },
          select: { id: true, invoiceNumber: true },
        });
        created.prepaidInvoiceId = invoice.id;
        await tx.order.update({ where: { id: created.id }, data: { prepaidInvoiceId: invoice.id } });
      }

      return { order: created, invoice };
    }, { timeout: 15000, maxWait: 5000 });

  let result;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      result = await runCreateTransaction();
      break;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (data.idempotencyKey && code === 'P2002') {
        const existing = await fastify.prisma.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
        if (existing && existing.companyId === companyId) return { order: existing };
      }
      if (code === 'P2002' && attempt < MAX_ATTEMPTS && (isFieldConflict(err, 'orderNumber') || isFieldConflict(err, 'invoiceNumber'))) continue;
      throw err;
    }
  }

  const { order, invoice } = result;
  let paymentUrl: string | undefined;

  if (data.payNow && invoice) {
    // Payment gateways enforce a minimum charge (RM1).
    if (order.total < 100) {
      throw { statusCode: 400, message: 'Order total is too low for online payment.' };
    }
    const settings = await fastify.prisma.setting.findMany({ where: { key: { in: ['payment_gateway'] } } });
    const gatewayName = settings.find((s) => s.key === 'payment_gateway')?.value || 'billplz';
    const gateway = getActiveGateway(gatewayName);

    if (gateway) {
      const bill = await gateway.createBill({
        name: company.contactName,
        email: company.email,
        phone: company.phone,
        amount: order.total,
        description: `ASCEND Order ${order.orderNumber}`,
        invoiceNumber: invoice.invoiceNumber,
        orderId: order.id,
      });
      paymentUrl = bill.paymentUrl;
    }
  }

  return { order, paymentUrl };
}

export async function listMyOrders(fastify: FastifyInstance, companyId: string, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = { companyId, deletedAt: null };
  if (query.status) where.status = query.status;
  // Resolves "which order did my accepted quote become" in one lookup rather
  // than paging through recent orders. Order.quotationId is @unique, and the
  // companyId scope above still applies, so this can't reach anyone else's.
  if (query.quotationId) where.quotationId = query.quotationId;

  const [orders, total] = await Promise.all([
    fastify.prisma.order.findMany({
      where,
      include: {
        items: { include: { variant: { select: { code: true, size: true, product: { select: { name: true } } } }, kit: { select: { name: true } } } },
        shippingAddress: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.order.count({ where }),
  ]);

  return paginatedResponse(orders, total, page, limit);
}

export async function getMyOrder(fastify: FastifyInstance, companyId: string, id: string) {
  const order = await fastify.prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { variant: { include: { product: true } }, kit: true } },
      shippingAddress: true,
      discountCode: { select: { code: true, discountType: true, discountValue: true } },
      // Nested batch + orderItem info here (not just the bare ShipmentItem
      // row) is what powers the frontend's Files tab (Batch.coaUrl per
      // shipment item — no separate document table, per docs/erd-b2b.md) and
      // the per-line display on the Shipments tab.
      shipments: {
        include: {
          items: {
            include: {
              batch: { select: { batchNumber: true, expiry: true, coaUrl: true } },
              orderItem: {
                include: {
                  variant: { select: { code: true, size: true, product: { select: { name: true } } } },
                  kit: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      statusHistory: { orderBy: { changedAt: 'asc' } },
    },
  });
  // Same as everywhere else a company can look up its own resource: 404 (not
  // 403) when it belongs to someone else, so existence isn't leaked.
  if (!order || order.companyId !== companyId) {
    throw { statusCode: 404, message: 'Order not found' };
  }
  return order;
}
