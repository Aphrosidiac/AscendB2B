import type { FastifyInstance } from 'fastify';
import type { PaymentMethod } from '@prisma/client';
import { enqueueEmail } from './email-outbox.js';

/**
 * Record a confirmed gateway payment against an Invoice, and (best-effort)
 * enqueue the order's PAYMENT_RECEIPT email.
 *
 * There is no unique constraint tying a gateway bill id to a Payment row (the
 * schema doesn't persist a pending bill ref anywhere — see decision #3's
 * documented gap in orders.controller.ts), so idempotency here is a
 * check-then-insert against (invoiceId, paymentRef) rather than a DB
 * constraint. A callback and a redirect-verify racing within the same few
 * seconds could in theory still double-insert; accepted given the schema
 * can't express a stronger guard without a migration.
 */
export async function confirmInvoicePayment(
  fastify: FastifyInstance,
  params: {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    paymentRef: string;
    // The Order this payment was raised for, if recoverable (Billplz
    // reference_2 — see payment-gateway.ts). Only used to enqueue the
    // PAYMENT_RECEIPT email; the Payment row itself only needs the invoice.
    orderId?: string;
  }
): Promise<boolean> {
  return fastify.prisma.$transaction(async (tx) => {
    const already = await tx.payment.findFirst({
      where: { invoiceId: params.invoiceId, paymentRef: params.paymentRef },
      select: { id: true },
    });
    if (already) return false;

    await tx.payment.create({
      data: {
        invoiceId: params.invoiceId,
        amount: params.amount,
        method: params.method,
        paymentRef: params.paymentRef,
      },
    });

    if (params.orderId) {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        select: { id: true, company: { select: { email: true } } },
      });
      if (order) await enqueueEmail(tx, order, 'PAYMENT_RECEIPT', order.company.email);
    }

    return true;
  });
}

// NOTE on the missing stale-payment sweep: the old B2C code periodically
// re-queried the gateway for any order stuck UNPAID past a timeout, because
// stock was reserved at order-creation time and had to be released if the
// customer abandoned payment. Under the B2B rules, nothing is reserved at
// order time (see rule #1 in orders.controller.ts) — an abandoned pay-now
// attempt just leaves the order without a Payment, with no stock or discount
// held hostage. There's also no schema field to enumerate "orders with a
// pending Billplz bill" from (no persisted bill ref — see decision #3), so a
// sweep isn't reconstructable the way it used to be. If this ever needs to
// become actionable again (e.g. surfacing "payment started but never
// finished" to an admin), it needs a real column to key off, not a periodic
// re-guess.
