import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getGatewayByBillId } from '../../utils/payment-gateway.js';
import { confirmInvoicePayment } from '../../utils/payment-reconcile.js';

export async function handlePaymentCallback(fastify: FastifyInstance, body: Record<string, string>) {
  const isBillplz = !!body.x_signature;
  const billId = isBillplz ? body.id : body.billcode;
  const gatewayName = isBillplz ? 'billplz' : 'toyyibpay';

  const gateway = getGatewayByBillId(billId, gatewayName);
  if (!gateway) {
    fastify.log.warn(`Payment callback: unknown gateway for bill ${billId}`);
    return { status: 'ok' };
  }

  if (!gateway.verifyCallback(body)) {
    // Don't log the full body — a forged/invalid callback may carry attacker- or
    // customer-supplied PII. The bill id is enough to investigate.
    fastify.log.warn({ gateway: gateway.name, billId }, 'Payment callback: invalid signature');
    throw { statusCode: 400, message: 'Invalid signature' };
  }

  const result = gateway.parseCallback(body);

  // Pending callbacks (e.g. ToyyibPay status 2) are not final — do nothing and
  // wait for the success/fail callback.
  if (result.status === 'pending') {
    return { status: 'ok' };
  }

  if (!result.invoiceNumber) {
    fastify.log.warn(`${gateway.name} callback: no invoice reference on bill ${result.billId}`);
    return { status: 'ok' };
  }

  const invoice = await fastify.prisma.invoice.findUnique({ where: { invoiceNumber: result.invoiceNumber } });
  if (!invoice) {
    fastify.log.warn(`${gateway.name} callback: no invoice ${result.invoiceNumber} for bill ${result.billId}`);
    return { status: 'ok' };
  }

  if (result.status === 'paid') {
    if (result.amount != null && result.amount !== invoice.total) {
      // Amount is server-controlled (the payer can't change the bill), so this
      // is a flag for investigation, not a hard block — we still confirm.
      fastify.log.warn(
        { invoiceNumber: invoice.invoiceNumber, expected: invoice.total, received: result.amount },
        'Payment amount mismatch'
      );
    }
    const confirmed = await confirmInvoicePayment(fastify, {
      invoiceId: invoice.id,
      amount: result.amount ?? invoice.total,
      // Every online-gateway confirmation (Billplz or ToyyibPay) records as
      // BILLPLZ under the repurposed PaymentMethod enum — see schema.prisma's
      // comment on PaymentMethod. WHATSAPP is reserved for admin-recorded
      // manual/off-platform payments.
      method: 'BILLPLZ',
      paymentRef: result.billId,
      orderId: result.orderId,
    });
    if (confirmed) {
      fastify.log.info(`Invoice ${invoice.invoiceNumber} paid via ${gateway.name} (bill ${result.billId})`);
    }
  } else {
    fastify.log.info(`Invoice ${invoice.invoiceNumber} payment failed via ${gateway.name} (bill ${result.billId})`);
  }

  return { status: 'ok' };
}

export async function handlePaymentRedirect(
  fastify: FastifyInstance,
  query: Record<string, string>
): Promise<string> {
  const isBillplz = !!query['billplz[id]'];
  const gatewayName = isBillplz ? 'billplz' : 'toyyibpay';
  const billId = isBillplz ? query['billplz[id]'] : query.billcode || '';

  const gateway = getGatewayByBillId(billId, gatewayName);
  if (!gateway) return `${env.FRONTEND_URL}/checkout/failed`;

  // Belt-and-suspenders: when the customer returns from the gateway, verify the
  // payment server-side and confirm even if the webhook callback was missed.
  if (billId) {
    try {
      const { paid, amount, invoiceNumber } = await gateway.verifyPaid(billId);
      if (paid && invoiceNumber) {
        const invoice = await fastify.prisma.invoice.findUnique({ where: { invoiceNumber } });
        if (invoice) {
          await confirmInvoicePayment(fastify, {
            invoiceId: invoice.id,
            amount: amount ?? invoice.total,
            method: 'BILLPLZ',
            paymentRef: billId,
          });
        }
      }
    } catch (err) {
      fastify.log.warn({ err, billId }, 'redirect: gateway verify failed');
    }
  }

  return gateway.buildRedirectUrl(query);
}
