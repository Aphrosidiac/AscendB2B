import type { FastifyInstance } from 'fastify';
import type { EmailOutbox, Payment } from '@prisma/client';
import { isEmailEnabled, sendEmail } from './email.js';
import { generateReceiptPdf } from './receipt-pdf.js';
import { renderOrderConfirmation } from '../emails/order-confirmation.js';
import { renderPaymentReceipt } from '../emails/payment-receipt.js';

const BATCH_SIZE = 10;
// Retry backoff by attempt count; after the last slot the row goes FAILED
// for good (admin can reset it via the resend-email endpoint).
const BACKOFF_MS = [
  1 * 60 * 1000, // 1m
  5 * 60 * 1000, // 5m
  30 * 60 * 1000, // 30m
  2 * 60 * 60 * 1000, // 2h
  6 * 60 * 60 * 1000, // 6h
];
const MAX_ATTEMPTS = BACKOFF_MS.length;

const ORDER_INCLUDE = {
  items: {
    include: {
      variant: { select: { code: true, size: true, product: { select: { name: true } } } },
      kit: { select: { name: true } },
    },
  },
  company: { select: { name: true, contactName: true, phone: true, email: true, creditTerms: true } },
  shippingAddress: { select: { line1: true, line2: true, city: true, state: true, postcode: true } },
  discountCode: { select: { code: true, discountType: true, discountValue: true } },
  shipments: { select: { carrier: true, trackingNumber: true } },
} as const;

// Best-effort match from an Order to the zero-item pay-now Invoice raised for
// it — Invoice belongs to Company, not Order (the ERD's shipment/invoice
// decoupling), so there's no FK to follow directly. A pay-now invoice is
// recognisable by shape: same company, same total, no InvoiceItems (a real
// shipment-billed invoice always has items), issued within moments of the
// order itself. See orders.controller.ts's createOrder for the documented
// gap this stems from (no Order<->Invoice link at all).
async function findPayNowPayment(
  fastify: FastifyInstance,
  order: { companyId: string; total: number; createdAt: Date }
): Promise<Payment | null> {
  const invoice = await fastify.prisma.invoice.findFirst({
    where: {
      companyId: order.companyId,
      total: order.total,
      items: { none: {} },
      issueDate: {
        gte: new Date(order.createdAt.getTime() - 5 * 60 * 1000),
        lte: new Date(order.createdAt.getTime() + 5 * 60 * 1000),
      },
    },
    orderBy: { issueDate: 'desc' },
    include: { payments: { orderBy: { paidAt: 'desc' }, take: 1 } },
  });
  return invoice?.payments[0] ?? null;
}

async function processRow(fastify: FastifyInstance, row: EmailOutbox): Promise<void> {
  const order = await fastify.prisma.order.findUnique({
    where: { id: row.orderId },
    include: ORDER_INCLUDE,
  });

  // Order gone/deleted, or a confirmation for an order that got cancelled
  // before we sent it — pointless (or confusing) to email now. Receipts are
  // exempt from the cancel check: a payment stays confirmed through later
  // status changes and the company is owed the receipt regardless.
  const ineligible =
    !order ||
    order.deletedAt !== null ||
    (row.type === 'ORDER_CONFIRMATION' && order.status === 'CANCELLED');
  if (ineligible) {
    await fastify.prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: 'FAILED', lastError: 'order no longer eligible' },
    });
    return;
  }

  try {
    let subject: string;
    let html: string;
    let attachments: { filename: string; content: Buffer }[] | undefined;

    // Same settings fetch feeds both the receipt PDF's company details AND
    // the email templates' admin-editable subject/badge/button/instructions
    // copy — one read, passed through to whichever template renders.
    const settingsRows = await fastify.prisma.setting.findMany();
    const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

    if (row.type === 'PAYMENT_RECEIPT') {
      const payment = await findPayNowPayment(fastify, order);
      if (!payment) {
        throw new Error('no matching Payment found for this order — cannot render a payment receipt');
      }
      ({ subject, html } = renderPaymentReceipt(order, payment, settings));
      const pdf = await generateReceiptPdf(order, settings, payment, order.shipments);
      attachments = [{ filename: `receipt-${order.orderNumber}.pdf`, content: pdf }];
    } else {
      ({ subject, html } = renderOrderConfirmation(order, order.id, settings));
    }

    const { id: resendId } = await sendEmail({ to: row.toEmail, subject, html, attachments });
    await fastify.prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: 'SENT', sentAt: new Date(), resendId },
    });
    fastify.log.info(`Email ${row.type} sent for order ${order.orderNumber} (resend ${resendId})`);
  } catch (err) {
    const attempts = row.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    await fastify.prisma.emailOutbox.update({
      where: { id: row.id },
      data: {
        attempts,
        lastError: message.slice(0, 500),
        ...(attempts >= MAX_ATTEMPTS
          ? { status: 'FAILED' }
          : { nextAttemptAt: new Date(Date.now() + BACKOFF_MS[attempts - 1]) }),
      },
    });
    fastify.log.warn({ err, outboxId: row.id, attempts }, `email ${row.type} send failed for order ${order.orderNumber}`);
  }
}

// Overlap guard: a slow batch (PDF render + 10 Resend calls) can outlive the
// 30s interval — skip the tick instead of double-sending.
let running = false;

/** Drain due PENDING outbox rows. Scheduled from server.ts. */
export async function processEmailOutbox(fastify: FastifyInstance): Promise<void> {
  if (running || !(await isEmailEnabled(fastify.prisma))) return;
  running = true;
  try {
    const rows = await fastify.prisma.emailOutbox.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });
    for (const row of rows) {
      await processRow(fastify, row);
    }
  } finally {
    running = false;
  }
}
