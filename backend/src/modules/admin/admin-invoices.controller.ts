import type { FastifyInstance } from 'fastify';
import type { CreditTerms, PaymentMethod, Prisma } from '@prisma/client';
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

// Status is derived from SUM(payments) vs total, which Prisma can't express
// as a relational filter — so status filtering has to happen in SQL, not in
// JS after the fact. Filtering in JS would silently corrupt pagination: page
// 1 would return however many of the first `limit` rows happened to match,
// not the first `limit` matching rows. Returns the matching id set, which the
// caller then feeds back into a normal Prisma query.
//
// Kept deliberately in lockstep with computeInvoiceStatus above — if that
// definition changes, this must change with it.
const INVOICE_STATUS_SQL: Record<string, string> = {
  VOID: `i."void" = true`,
  PAID: `i."void" = false AND i.total > 0 AND COALESCE(p.paid, 0) >= i.total`,
  PARTIALLY_PAID: `i."void" = false AND COALESCE(p.paid, 0) > 0 AND NOT (i.total > 0 AND COALESCE(p.paid, 0) >= i.total)`,
  OVERDUE: `i."void" = false AND COALESCE(p.paid, 0) = 0 AND i."dueDate" < NOW()`,
  UNPAID: `i."void" = false AND COALESCE(p.paid, 0) = 0 AND i."dueDate" >= NOW()`,
  // Not a computeInvoiceStatus value — the operational "what is still owed"
  // rollup (unpaid + partially paid + overdue), which is the view an admin
  // actually works from at month end.
  OUTSTANDING: `i."void" = false AND NOT (i.total > 0 AND COALESCE(p.paid, 0) >= i.total)`,
};

// companyId is passed as a bound parameter, never interpolated; `condition`
// is looked up from the fixed map above, so `status` only ever selects a key.
// Exported so the company-facing invoice list filters by the exact same
// definition rather than reimplementing it.
export async function invoiceIdsMatchingStatus(
  fastify: FastifyInstance,
  status: string,
  companyId?: string
): Promise<string[]> {
  const condition = INVOICE_STATUS_SQL[status];
  if (!condition) return [];
  const sql = `SELECT i.id
       FROM invoices i
       LEFT JOIN (
         SELECT "invoiceId", SUM(amount)::bigint AS paid
           FROM payments
          GROUP BY "invoiceId"
       ) p ON p."invoiceId" = i.id
      WHERE ${condition}${companyId ? ' AND i."companyId" = $1' : ''}`;
  const rows = companyId
    ? await fastify.prisma.$queryRawUnsafe<{ id: string }[]>(sql, companyId)
    : await fastify.prisma.$queryRawUnsafe<{ id: string }[]>(sql);
  return rows.map((r) => r.id);
}

export async function adminListInvoices(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.companyId) where.companyId = query.companyId;
  if (query.status) {
    where.id = { in: await invoiceIdsMatchingStatus(fastify, query.status) };
  }
  if (query.search) {
    where.OR = [
      { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
      { company: { name: { contains: query.search, mode: 'insensitive' } } },
      // A company with no business profile yet has a null name — see the same
      // clause in admin-orders.controller.ts.
      { company: { username: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
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
        company: { select: { username: true, id: true, name: true, creditTerms: true } },
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

  return { ...paginatedResponse(withStatus, total, page, limit), summary: await outstandingSummary(fastify) };
}

// The billing worklist that makes consolidated invoicing reachable at all.
//
// Invoice deliberately has no FK to Order (it belongs to Company — see the
// shipment/invoice decoupling in docs/erd-b2b.md) precisely so one invoice
// can cover shipments spanning several orders. Without this endpoint the
// only way to invoice anything was to already know which single order to
// open, which made that cross-order case unreachable from the UI.
//
// No companyId: "who is owed an invoice", grouped per company.
// With companyId: every unbilled ShipmentItem for that company across ALL
// their orders, ready to be selected and passed to adminGenerateInvoice.
export async function adminListUnbilled(fastify: FastifyInstance, query: Record<string, string>) {
  // "Billable" has to mean exactly what adminGenerateInvoice will actually
  // accept, or the worklist offers items that then bounce on submit:
  //   - not already invoiced,
  //   - actually shipped — Invoice.dueDate is derived from issue time = ship
  //     time (see the ERD), so billing goods that haven't left would start
  //     the NET30 clock before the customer can possibly have received them,
  //   - not part of an order already settled by a pay-now prepaid invoice,
  //     which adminGenerateInvoice rejects outright as double-billing.
  const orderWhere: Prisma.OrderWhereInput = {
    OR: [{ prepaidInvoiceId: null }, { prepaidInvoice: { is: { void: true } } }],
  };
  if (query.companyId) orderWhere.companyId = query.companyId;

  const unbilled: Prisma.ShipmentItemWhereInput = {
    invoiceItem: { is: null },
    shipment: { is: { shippedAt: { not: null }, order: { is: orderWhere } } },
  };

  const items = await fastify.prisma.shipmentItem.findMany({
    where: unbilled,
    include: {
      orderItem: {
        select: {
          unitPrice: true,
          variant: { select: { code: true, size: true, product: { select: { name: true } } } },
          kit: { select: { name: true } },
        },
      },
      batch: { select: { batchNumber: true } },
      shipment: {
        select: {
          id: true,
          shipmentNumber: true,
          shippedAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              company: { select: { username: true, id: true, name: true, creditTerms: true } },
            },
          },
        },
      },
    },
    orderBy: { shipment: { createdAt: 'asc' } },
  });

  const withAmount = items.map((si) => ({
    ...si,
    // Same derivation as adminGenerateInvoice's InvoiceItem.amount — kept
    // identical so the preview an admin selects from can't disagree with
    // what actually gets billed.
    amount: si.quantity * si.orderItem.unitPrice,
  }));

  if (query.companyId) return { items: withAmount };

  // Grouped rollup: one row per company with something waiting to be billed.
  const byCompany = new Map<string, { company: { id: string; name: string | null; creditTerms: string }; itemCount: number; orderIds: Set<string>; amount: number }>();
  for (const si of withAmount) {
    const c = si.shipment.order.company;
    const entry = byCompany.get(c.id) ?? { company: c, itemCount: 0, orderIds: new Set<string>(), amount: 0 };
    entry.itemCount += 1;
    entry.orderIds.add(si.shipment.order.id);
    entry.amount += si.amount;
    byCompany.set(c.id, entry);
  }

  return {
    companies: [...byCompany.values()]
      .map((e) => ({ company: e.company, itemCount: e.itemCount, orderCount: e.orderIds.size, amount: e.amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// Receivables rollup for the top of the invoices page — deliberately NOT
// scoped by the caller's filters: an admin filtered down to one company
// still wants to know the business-wide exposure, and it's the number that
// answers "how much is owed / how much is late" at a glance.
// Exported and company-scopable so the customer's own invoice page can show a
// true account-wide balance instead of summing whatever page it happened to
// fetch — a balance that silently only covers "the most recent N" is worse
// than no balance at all.
export async function outstandingSummary(fastify: FastifyInstance, companyId?: string) {
  const sql = `SELECT
       COALESCE(SUM(i.total - COALESCE(p.paid, 0)), 0) AS outstanding,
       COALESCE(SUM(CASE WHEN i."dueDate" < NOW() THEN i.total - COALESCE(p.paid, 0) ELSE 0 END), 0) AS overdue,
       COUNT(*) AS outstanding_count,
       COUNT(*) FILTER (WHERE i."dueDate" < NOW()) AS overdue_count
     FROM invoices i
     LEFT JOIN (
       SELECT "invoiceId", SUM(amount)::bigint AS paid
         FROM payments
        GROUP BY "invoiceId"
     ) p ON p."invoiceId" = i.id
     WHERE i."void" = false AND NOT (i.total > 0 AND COALESCE(p.paid, 0) >= i.total)${companyId ? ' AND i."companyId" = $1' : ''}`;
  type Row = { outstanding: bigint | null; overdue: bigint | null; outstanding_count: bigint; overdue_count: bigint };
  const rows = companyId
    ? await fastify.prisma.$queryRawUnsafe<Row[]>(sql, companyId)
    : await fastify.prisma.$queryRawUnsafe<Row[]>(sql);
  const r = rows[0];
  return {
    outstandingAmount: Number(r?.outstanding ?? 0),
    overdueAmount: Number(r?.overdue ?? 0),
    outstandingCount: Number(r?.outstanding_count ?? 0),
    overdueCount: Number(r?.overdue_count ?? 0),
  };
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
              shipment: { select: { id: true, shipmentNumber: true, orderId: true, order: { select: { orderNumber: true } } } },
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
      shipment: {
        select: {
          shipmentNumber: true,
          shippedAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              companyId: true,
              prepaidInvoice: { select: { id: true, invoiceNumber: true, void: true } },
            },
          },
        },
      },
    },
  });

  if (shipmentItems.length !== data.shipmentItemIds.length) {
    throw { statusCode: 400, message: 'One or more shipment items were not found' };
  }
  const alreadyBilled = shipmentItems.filter((si) => si.invoiceItem);
  if (alreadyBilled.length > 0) {
    throw { statusCode: 400, message: `Shipment item(s) ${alreadyBilled.map((si) => si.id).join(', ')} are already invoiced` };
  }
  // dueDate is issueDate + credit terms, and issueDate is now — so invoicing
  // goods that haven't shipped starts the customer's NET clock before they
  // could possibly receive anything. That's precisely the failure mode the
  // ERD's "dueDate is set at shipment, never at order time" rule exists to
  // prevent, so it's blocked rather than left to admin discipline.
  const notShipped = shipmentItems.filter((si) => !si.shipment.shippedAt);
  if (notShipped.length > 0) {
    const shipmentNumbers = [...new Set(notShipped.map((si) => si.shipment.shipmentNumber))];
    throw {
      statusCode: 400,
      message: `Shipment(s) ${shipmentNumbers.join(', ')} haven't shipped yet — mark them shipped before invoicing, so the payment due date runs from dispatch.`,
    };
  }
  // An order paid in full via pay-now at checkout (a zero-item Invoice, see
  // Order.prepaidInvoiceId) has already been billed — generating a normal
  // invoice for its shipment items would double-bill the same goods, unless
  // that prepaid invoice was later voided (e.g. a refund).
  const alreadyPrepaid = shipmentItems.filter((si) => si.shipment.order.prepaidInvoice && !si.shipment.order.prepaidInvoice.void);
  if (alreadyPrepaid.length > 0) {
    const orderNumbers = [...new Set(alreadyPrepaid.map((si) => si.shipment.order.orderNumber))];
    throw {
      statusCode: 400,
      message: `Order(s) ${orderNumbers.join(', ')} were already paid via pay-now at checkout — void the prepaid invoice first if these goods genuinely need re-invoicing.`,
    };
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
