import type { FastifyInstance } from 'fastify';
import { generateReceiptPdf } from '../../utils/receipt-pdf.js';

const RECEIPT_INCLUDE = {
  items: {
    include: {
      variant: { select: { code: true, size: true, product: { select: { name: true } } } },
      kit: { select: { name: true } },
    },
  },
  company: { select: { name: true, contactName: true, phone: true, email: true } },
  shippingAddress: { select: { line1: true, line2: true, city: true, state: true, postcode: true } },
  discountCode: { select: { code: true, discountType: true, discountValue: true } },
  shipments: { select: { carrier: true, trackingNumber: true } },
} as const;

// Company-scoped — the old guest phone+orderNumber receipt lookup is gone
// entirely (see decision #4). 404 (not 403) when it belongs to someone else,
// same "don't leak existence" convention as everywhere else a company reads
// its own resources.
export async function getMyReceiptData(fastify: FastifyInstance, companyId: string, orderId: string) {
  const order = await fastify.prisma.order.findUnique({
    where: { id: orderId },
    include: RECEIPT_INCLUDE,
  });
  if (!order || order.companyId !== companyId || order.deletedAt !== null) {
    throw { statusCode: 404, message: 'Order not found' };
  }
  return order;
}

export async function getMyReceiptPdf(fastify: FastifyInstance, companyId: string, orderId: string) {
  const order = await getMyReceiptData(fastify, companyId, orderId);
  const settingsRows = await fastify.prisma.setting.findMany();
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));
  // Payment/invoice details deliberately aren't looked up here — there's no
  // reliable FK from Order to the Invoice/Payment that might cover it (see
  // the documented gap in orders.controller.ts's createOrder); the receipt
  // just omits that section rather than guessing.
  const pdf = await generateReceiptPdf(order, settings, null, order.shipments);
  return { order, pdf };
}

export async function adminGetReceiptPdf(fastify: FastifyInstance, id: string) {
  const order = await fastify.prisma.order.findUnique({
    where: { id },
    include: RECEIPT_INCLUDE,
  });

  if (!order) throw { statusCode: 404, message: 'Order not found' };

  const settingsRows = await fastify.prisma.setting.findMany();
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));
  return generateReceiptPdf(order, settings, null, order.shipments);
}
