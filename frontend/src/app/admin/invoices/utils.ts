import type { InvoiceStatus } from '@/types';

// Whole days past an invoice's due date, 0 if not yet due. Kept here rather
// than in either page so the list's "12 days overdue" cell and the detail
// header can't drift on the definition.
export function daysOverdue(dueDate: string): number {
  const diff = Date.now() - new Date(dueDate).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}

// "12 days overdue" for the list cell / detail header, or null when there's
// nothing to flag. Handles the same-day case explicitly — an invoice the
// server already calls OVERDUE but which came due only hours ago would
// otherwise silently render no warning at all (daysOverdue floors to 0).
// A partially-paid invoice past its due date never gets status OVERDUE
// (see computeInvoiceStatus) but is still late, so it's flagged too.
export function overdueLabel(dueDate: string, status: InvoiceStatus): string | null {
  if (status === 'PAID' || status === 'VOID') return null;
  const days = daysOverdue(dueDate);
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} overdue`;
  return status === 'OVERDUE' ? 'Overdue today' : null;
}

// The API serialises failures as `{ error }` (see
// backend/src/plugins/error-handler.ts), NOT `{ message }` — reading only
// `message` swallows genuinely actionable text like "Order X was already paid
// via pay-now at checkout — void the prepaid invoice first", which is exactly
// what tells an admin what to do next.
export function errorMessage(err: unknown, fallback: string): string {
  const data = err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
    : undefined;
  return data?.error ?? data?.message ?? fallback;
}

// Payment methods as an admin should read them. WHATSAPP no longer means the
// old chat checkout — it's a bank transfer confirmed off-platform and
// recorded by hand (see schema.prisma's PaymentMethod comment).
export const PAYMENT_METHOD_LABELS: Record<'WHATSAPP' | 'BILLPLZ', string> = {
  WHATSAPP: 'Bank transfer (manual)',
  BILLPLZ: 'Online (Billplz)',
};
