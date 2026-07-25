import type { FastifyInstance } from 'fastify';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { computeInvoiceStatus, invoiceIdsMatchingStatus, outstandingSummary } from '../admin/admin-invoices.controller.js';

// Company-scoped mirror of admin-invoices.controller.ts's list/get — a
// company can only ever see its own invoices, and paid/void/overdue status is
// computed via the exact same shared function so the two surfaces can never
// disagree on what "paid" means.

export async function listMyInvoices(fastify: FastifyInstance, companyId: string, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = { companyId };
  // Lets the order-detail Invoices tab ask "which invoices touch this
  // order" without a dedicated endpoint — Invoice has no direct FK to Order
  // (it belongs to Company; see docs/erd-b2b.md's shipment/invoice
  // decoupling), so this walks the relation the other way: an invoice
  // matches if any of its items bill a ShipmentItem whose Shipment belongs
  // to this order.
  if (query.orderId) {
    where.items = { some: { shipmentItem: { shipment: { orderId: query.orderId } } } };
  }
  // Same server-side status filtering the admin list uses — scoped to this
  // company. Without it the page could only filter whatever it had already
  // fetched, which breaks as soon as a company has more than one page.
  if (query.status) {
    where.id = { in: await invoiceIdsMatchingStatus(fastify, query.status, companyId) };
  }

  const [invoices, total] = await Promise.all([
    fastify.prisma.invoice.findMany({
      where,
      include: {
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

  // Account-wide, deliberately not scoped to the current filter/page — "what
  // I owe" has to be the real balance, not a subtotal of what's on screen.
  return { ...paginatedResponse(withStatus, total, page, limit), summary: await outstandingSummary(fastify, companyId) };
}

export async function getMyInvoice(fastify: FastifyInstance, companyId: string, id: string) {
  const invoice = await fastify.prisma.invoice.findUnique({
    where: { id },
    include: {
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
  // 404 (not 403) when it belongs to someone else — same "don't leak
  // existence" convention as every other company-owns-this-resource check.
  if (!invoice || invoice.companyId !== companyId) {
    throw { statusCode: 404, message: 'Invoice not found' };
  }

  const paidAmount = invoice.payments.reduce((s, p) => s + p.amount, 0);
  return { ...invoice, paidAmount, status: computeInvoiceStatus(invoice, paidAmount) };
}
