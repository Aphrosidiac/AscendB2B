import type { Invoice } from '@/types';

const DAY_MS = 86_400_000;

/** What's still owed on this invoice. A voided invoice owes nothing. */
export function invoiceOutstanding(invoice: Invoice): number {
  if (invoice.void) return 0;
  return Math.max(0, invoice.total - invoice.paidAmount);
}

/**
 * Days past the due date, or 0 if not yet due / nothing owed.
 *
 * Deliberately independent of `invoice.status`: computeInvoiceStatus on the
 * backend ranks PARTIALLY_PAID above OVERDUE, so a part-paid invoice that blew
 * past its due date reports PARTIALLY_PAID and would otherwise read as on-time
 * here. The customer needs to know it's late either way.
 */
export function daysPastDue(invoice: Invoice, now: number = Date.now()): number {
  if (invoiceOutstanding(invoice) === 0) return 0;
  const overdueMs = now - new Date(invoice.dueDate).getTime();
  return overdueMs > 0 ? Math.max(1, Math.floor(overdueMs / DAY_MS)) : 0;
}

/** Outstanding / overdue rollup across a set of invoices (client-derived). */
export function summariseInvoices(invoices: Invoice[], now: number = Date.now()) {
  let outstanding = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const invoice of invoices) {
    const owed = invoiceOutstanding(invoice);
    outstanding += owed;
    if (daysPastDue(invoice, now) > 0) {
      overdue += owed;
      overdueCount += 1;
    }
  }
  return { outstanding, overdue, overdueCount };
}
