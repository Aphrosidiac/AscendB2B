import type { FastifyInstance } from 'fastify';
import type { CreditTerms, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { generateInvoiceNumber } from '../../utils/invoice-number.js';

const CREDIT_TERMS_DAYS: Record<CreditTerms, number> = {
  PREPAID: 0,
  NET15: 15,
  NET30: 30,
  NET60: 60,
};

// paid/partially-paid/overdue are computed, never stored (see schema.prisma's
// comment on Invoice) — this is the single place that logic lives so the
// list and detail endpoints can't drift on the definition.
export function computeInvoiceStatus(
  invoice: { total: number; void: boolean; dueDate: Date },
  paidAmount: number
): 'VOID' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'UNPAID' {
  if (invoice.void) return 'VOID';
  if (invoice.total > 0 && paidAmount >= invoice.total) return 'PAID';
  if (paidAmount > 0) return 'PARTIALLY_PAID';
  if (invoice.dueDate.getTime() < Date.now()) return 'OVERDUE';
  return 'UNPAID';
}

export async function adminListInvoices(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.companyId) where.companyId = query.companyId;
  // Lets the admin order-detail Invoices tab ask "which invoices touch this
  // order" — same traversal as company-invoices.controller.ts's listMyInvoices
  // (Invoice has no direct FK to Order; it belongs to Company, see
  // docs/erd-b2b.md's shipment/invoice decoupling).
  if (query.orderId) {
    where.items = { some: { shipmentItem: { shipment: { orderId: query.orderId } } } };
  }

  const [invoices, total] = await Promise.all([
    fastify.prisma.invoice.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, creditTerms: true } },
        payments: { select: { amount: true } },
        _count: { select: { items: true } },
      },
      orderBy: { issueDate: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.invoice.count({ where }),
  ]);

  const withStatus = invoices.map((invoice) => {
    const paidAmount = invoice.payments.reduce((s, p) => s + p.amount, 0);
    return { ...invoice, paidAmount, status: computeInvoiceStatus(invoice, paidAmount) };
  });

  return paginatedResponse(withStatus, total, page, limit);
}

export async function adminGetInvoice(fastify: FastifyInstance, id: string) {
  const invoice = await fastify.prisma.invoice.findUnique({
    where: { id },
    include: {
      company: true,
      items: {
        include: {
          shipmentItem: {
            include: {
              batch: { select: { batchNumber: true, expiry: true, coaUrl: true } },
              orderItem: {
                include: {
                  variant: { select: { code: true, size: true, product: { select: { name: true } } } },
                  kit: { select: { name: true } },
                },
              },
              shipment: { select: { id: true, shipmentNumber: true, orderId: true } },
            },
          },
        },
      },
      payments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };

  const paidAmount = invoice.payments.reduce((s, p) => s + p.amount, 0);
  return { ...invoice, paidAmount, status: computeInvoiceStatus(invoice, paidAmount) };
}

const generateInvoiceSchema = z.object({
  shipmentItemIds: z.array(z.string()).min(1).max(500),
});

// Generates one Invoice from a set of ShipmentItems that can span multiple
// orders/shipments for the SAME company — this is the whole point of the
// shipment/invoice decoupling (see docs/erd-b2b.md): monthly consolidated
// billing under credit terms shouldn't be forced 1:1 with a single order.
export async function adminGenerateInvoice(fastify: FastifyInstance, body: unknown) {
  const data = generateInvoiceSchema.parse(body);

  const shipmentItems = await fastify.prisma.shipmentItem.findMany({
    where: { id: { in: data.shipmentItemIds } },
    include: {
      orderItem: { select: { unitPrice: true } },
      invoiceItem: { select: { id: true } },
      shipment: { select: { order: { select: { companyId: true, id: true } } } },
    },
  });

  if (shipmentItems.length !== data.shipmentItemIds.length) {
    throw { statusCode: 400, message: 'One or more shipment items were not found' };
  }
  const alreadyBilled = shipmentItems.filter((si) => si.invoiceItem);
  if (alreadyBilled.length > 0) {
    throw { statusCode: 400, message: `Shipment item(s) ${alreadyBilled.map((si) => si.id).join(', ')} are already invoiced` };
  }
  const companyIds = new Set(shipmentItems.map((si) => si.shipment.order.companyId));
  if (companyIds.size > 1) {
    throw { statusCode: 400, message: 'All shipment items must belong to the same company' };
  }
  const companyId = [...companyIds][0];

  const company = await fastify.prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw { statusCode: 404, message: 'Company not found' };

  const now = new Date();
  const dueDate = new Date(now.getTime() + CREDIT_TERMS_DAYS[company.creditTerms] * 24 * 60 * 60 * 1000);

  // KNOWN GAP (see decision #3 in the task brief / orders.controller.ts): if
  // any of these shipment items trace back to an order that was paid via a
  // zero-item pay-now Invoice, this generates a SECOND, real invoice for the
  // same goods with no schema-level link warning the admin — Invoice has no
  // FK to Order, so there's nothing to check against here. Left as a manual
  // process concern; a real fix needs a schema change (e.g. Invoice.orderId
  // or a join table) that's out of scope for this pass.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const invoiceNumber = await generateInvoiceNumber(tx);
        const total = shipmentItems.reduce((sum, si) => sum + si.quantity * si.orderItem.unitPrice, 0);

        return tx.invoice.create({
          data: {
            invoiceNumber,
            companyId,
            issueDate: now,
            dueDate,
            total,
            items: {
              create: shipmentItems.map((si) => ({
                shipmentItemId: si.id,
                amount: si.quantity * si.orderItem.unitPrice,
              })),
            },
          },
          include: { items: true },
        });
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const meta = (err as { meta?: { target?: string | string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } })?.meta;
      const fields = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
      const conflict = Array.isArray(fields) ? fields.includes('invoiceNumber') : typeof fields === 'string' && fields.includes('invoiceNumber');
      if (code === 'P2002' && attempt < MAX_ATTEMPTS && conflict) continue;
      throw err;
    }
  }
}

const recordPaymentSchema = z.object({
  amount: z.number().int().min(1),
  method: z.enum(['WHATSAPP', 'BILLPLZ']),
  paymentRef: z.string().optional(),
});

// Admin marks a payment received against an invoice — the "bank transfer
// confirmed off-platform" path. method WHATSAPP here means exactly that (see
// schema.prisma's PaymentMethod comment); BILLPLZ would be unusual through
// this endpoint (the gateway flow records its own Payment via the webhook)
// but isn't blocked — an admin might use it to log a gateway payment that
// arrived by some other confirmed-but-out-of-band means.
export async function adminRecordPayment(fastify: FastifyInstance, invoiceId: string, body: unknown) {
  const data = recordPaymentSchema.parse(body);

  const invoice = await fastify.prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };
  if (invoice.void) throw { statusCode: 400, message: 'Cannot record a payment against a voided invoice' };

  return fastify.prisma.payment.create({
    data: {
      invoiceId,
      amount: data.amount,
      method: data.method as PaymentMethod,
      paymentRef: data.paymentRef,
    },
  });
}

export async function adminVoidInvoice(fastify: FastifyInstance, id: string) {
  const invoice = await fastify.prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };
  return fastify.prisma.invoice.update({ where: { id }, data: { void: true } });
}
