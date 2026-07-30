import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PACKING', 'SHIPPED', 'PARTIALLY_SHIPPED', 'DELIVERED', 'COMPLETE', 'CANCELLED'] as const;

const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  // Logged onto the OrderStatusHistory row this status change creates —
  // ignored if `status` isn't also present.
  note: z.string().max(1000).optional(),
  notes: z.string().optional(),
});

const resendEmailSchema = z.object({
  type: z.enum(['ORDER_CONFIRMATION', 'PAYMENT_RECEIPT']),
});

// Outbox fields surfaced per order in the admin list/detail responses —
// enough for the "sent / pending / failed (n attempts)" chips and nothing
// internal (no resendId/nextAttemptAt).
const EMAIL_STATUS_SELECT = {
  select: { type: true, status: true, attempts: true, sentAt: true, lastError: true },
} as const;

export async function adminListOrders(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);

  // "DELETED" is a pseudo-status, not a real OrderStatus value — it shows
  // only soft-deleted orders. Every other view (including "ALL") excludes
  // them by default so a deleted order never resurfaces in the main list.
  const where: Record<string, unknown> = query.status === 'DELETED'
    ? { deletedAt: { not: null } }
    : { deletedAt: null, ...(query.status ? { status: query.status } : {}) };
  if (query.companyId) where.companyId = query.companyId;
  // Lets a quotation page resolve "which order did this quote become" in one
  // lookup. Order.quotationId is @unique, so this matches at most one row —
  // without it the caller has to page through recent orders hunting for it.
  if (query.quotationId) where.quotationId = query.quotationId;
  if (query.search) {
    where.OR = [
      { orderNumber: { contains: query.search, mode: 'insensitive' } },
      { company: { name: { contains: query.search, mode: 'insensitive' } } },
      // Signup only collects username/email/password, so a company that hasn't
      // filled in its business profile yet has a null name — searchable only by
      // the handle the admin actually sees in the list.
      { company: { username: { contains: query.search, mode: 'insensitive' } } },
      { company: { contactName: { contains: query.search, mode: 'insensitive' } } },
      { company: { email: { contains: query.search, mode: 'insensitive' } } },
    ];
  }

  const [orders, total] = await Promise.all([
    fastify.prisma.order.findMany({
      where,
      include: {
        items: { include: { variant: { select: { code: true, size: true, product: { select: { name: true } } } }, kit: { select: { name: true } } } },
        company: { select: { username: true, id: true, name: true, contactName: true, email: true, creditTerms: true } },
        discountCode: { select: { code: true, discountType: true, discountValue: true } },
        emails: EMAIL_STATUS_SELECT,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.order.count({ where }),
  ]);

  return paginatedResponse(orders, total, page, limit);
}

export async function adminGetOrder(fastify: FastifyInstance, id: string) {
  const order = await fastify.prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { variant: { include: { product: true } }, kit: true } },
      company: true,
      shippingAddress: true,
      discountCode: { select: { code: true, discountType: true, discountValue: true } },
      emails: EMAIL_STATUS_SELECT,
      // Nested orderItem (not just batch) mirrors getMyOrder's include in
      // orders/orders.controller.ts — the admin Shipments tab needs the same
      // per-line item display (variant/kit name) as the company-facing page.
      shipments: {
        include: {
          items: {
            include: {
              batch: true,
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

  if (!order) throw { statusCode: 404, message: 'Order not found' };
  return order;
}

export async function adminUpdateOrder(fastify: FastifyInstance, id: string, body: unknown) {
  const data = updateOrderSchema.parse(body);

  const order = await fastify.prisma.order.findUnique({
    where: { id },
    include: { items: { include: { shipmentItems: { select: { id: true } } } } },
  });
  if (!order) throw { statusCode: 404, message: 'Order not found' };

  if (data.status === 'CANCELLED') {
    const alreadyShipped = order.items.some((i) => i.shipmentItems.length > 0);
    if (alreadyShipped) {
      throw {
        statusCode: 400,
        message: 'This order already has shipments and cannot be cancelled — use a return/refund flow instead.',
      };
    }
    // Nothing to restore: nothing is reserved/decremented at order-creation
    // time (see rule #1 in orders.controller.ts) — a cancel before any
    // shipment is just a status change.
  }

  const updateData: Record<string, unknown> = {};
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.status) updateData.status = data.status;

  if (data.status && data.status !== order.status) {
    return fastify.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({ where: { id }, data: updateData });
      await tx.orderStatusHistory.create({ data: { orderId: id, status: data.status!, note: data.note } });
      return updated;
    });
  }

  return fastify.prisma.order.update({ where: { id }, data: updateData });
}

// Soft-delete: never removes the row. It just sets deletedAt so the order
// disappears from every normal view and only shows up under the "DELETED"
// filter — order status and any shipments/invoices are untouched either way.
export async function adminDeleteOrder(fastify: FastifyInstance, id: string) {
  const order = await fastify.prisma.order.findUnique({ where: { id } });
  if (!order) throw { statusCode: 404, message: 'Order not found' };
  return fastify.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function adminRestoreOrder(fastify: FastifyInstance, id: string) {
  const order = await fastify.prisma.order.findUnique({ where: { id } });
  if (!order) throw { statusCode: 404, message: 'Order not found' };
  return fastify.prisma.order.update({ where: { id }, data: { deletedAt: null } });
}

// Re-queue (or first-queue, if the row never existed) an email for the
// worker to send. Resets a FAILED row's attempt budget so the backoff starts
// over. Recipient is always the Company's email now (Order dropped its own
// optional guest email field).
export async function adminResendOrderEmail(fastify: FastifyInstance, id: string, body: unknown) {
  const { type } = resendEmailSchema.parse(body);

  const order = await fastify.prisma.order.findUnique({ where: { id }, include: { company: { select: { email: true } } } });
  if (!order) throw { statusCode: 404, message: 'Order not found' };

  return fastify.prisma.emailOutbox.upsert({
    where: { orderId_type: { orderId: order.id, type } },
    update: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null, toEmail: order.company.email },
    create: { orderId: order.id, type, toEmail: order.company.email },
  });
}
