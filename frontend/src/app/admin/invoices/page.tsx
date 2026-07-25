'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Plus, ChevronLeft, ChevronRight, AlertTriangle, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminListInvoices } from '@/lib/api';
import { formatPrice, formatShortDate } from '@/lib/utils';
import { rowLink } from '@/lib/row-link';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatusFilterPills } from '@/components/orders/StatusFilterPills';
import { FadeSwap } from '@/components/orders/FadeSwap';
import { GenerateInvoiceModal } from './GenerateInvoiceModal';
import { overdueLabel } from './utils';
import type { Invoice, InvoiceReceivablesSummary, PaginatedResponse } from '@/types';

const LIMIT = 25;

// `OUTSTANDING` isn't an InvoiceStatus — it's the server's operational rollup
// (unpaid + partially paid + overdue), i.e. the view an admin actually works
// from at month end, which is why the page opens on it. Every value here is
// sent straight through as the server's `?status=` param; nothing is filtered
// client-side, because status is derived from SUM(payments) and filtering
// after pagination would silently return the wrong rows per page.
const INVOICE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'OUTSTANDING', label: 'Outstanding' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'VOID', label: 'Void' },
  { value: '', label: 'All' },
];

function SummaryCard({
  label, caption, amount, count, urgent,
}: { label: string; caption: string; amount: number; count: number; urgent?: boolean }) {
  const Icon = urgent ? AlertTriangle : Wallet;
  return (
    <div className={urgent
      ? 'rounded-xl border border-red-200 bg-red-50 p-5'
      : 'rounded-xl border border-border bg-surface p-5'}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={urgent ? 'w-4 h-4 text-danger' : 'w-4 h-4 text-text-muted'} />
        <p className={urgent
          ? 'text-xs font-medium uppercase tracking-wider text-danger'
          : 'text-xs font-medium uppercase tracking-wider text-text-muted'}
        >
          {label}
        </p>
      </div>
      <p className={urgent
        ? 'font-display text-2xl font-bold text-danger tabular-nums'
        : 'font-display text-2xl font-bold tabular-nums'}
      >
        {formatPrice(amount)}
      </p>
      <p className="text-xs text-text-muted mt-1">
        {count} invoice{count !== 1 ? 's' : ''} &middot; {caption}
      </p>
    </div>
  );
}

export default function AdminInvoicesPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<Invoice>['pagination'] | null>(null);
  const [summary, setSummary] = useState<InvoiceReceivablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // Opens on the working view, not on everything ever billed.
  const [status, setStatus] = useState<string>('OUTSTANDING');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showGenerate, setShowGenerate] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
    if (status) params.status = status;
    if (debouncedSearch) params.search = debouncedSearch;
    adminListInvoices(token, params)
      .then((r) => {
        setInvoices(r.data);
        setPagination(r.pagination);
        setSummary(r.summary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, status, debouncedSearch, page]);

  useEffect(load, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-2xl font-bold">Invoices</h1>
        <Button onClick={() => setShowGenerate(true)}>
          <Plus className="w-4 h-4" /> Generate Invoice
        </Button>
      </div>

      {/* Business-wide receivables — deliberately NOT scoped to the filters
          below (see outstandingSummary in admin-invoices.controller.ts), so
          it's labelled as such rather than reading as a filtered total. */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <SummaryCard
          label="Outstanding"
          caption="business-wide, all filters"
          amount={summary?.outstandingAmount ?? 0}
          count={summary?.outstandingCount ?? 0}
        />
        <SummaryCard
          label="Overdue"
          caption="business-wide, past due date"
          amount={summary?.overdueAmount ?? 0}
          count={summary?.overdueCount ?? 0}
          urgent
        />
      </div>

      <div className="relative w-full max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search by invoice # or company..."
          value={search}
          // Any change to what's being asked for restarts at page 1 —
          // otherwise a filter applied from page 3 lands on an empty page.
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      <div className="mb-6">
        <StatusFilterPills
          options={INVOICE_FILTER_OPTIONS}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
        />
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${debouncedSearch}:${page}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-lg mb-1">No invoices found</p>
            <p className="text-text-muted text-sm">
              {debouncedSearch
                ? 'Try a different search term.'
                : status === 'OUTSTANDING'
                  ? 'Nothing is currently owed — every invoice has been settled.'
                  : status
                    ? 'No invoices with this status.'
                    : 'Generate one from shipped items that have not been billed yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated">
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Invoice #</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Issued</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Due</th>
                    <th className="px-4 py-3 text-right font-medium text-text-secondary">Total</th>
                    <th className="px-4 py-3 text-right font-medium text-text-secondary">Paid / Outstanding</th>
                    <th className="px-4 py-3 text-center font-medium text-text-secondary">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const late = overdueLabel(invoice.dueDate, invoice.status);
                    const outstanding = invoice.total - invoice.paidAmount;
                    return (
                      <tr key={invoice.id} {...rowLink(() => router.push(`/admin/invoices/${invoice.id}`))} className="border-b border-border last:border-0 hover:bg-surface-elevated/50 cursor-pointer">
                        <td className="px-4 py-3">
                          <Link href={`/admin/invoices/${invoice.id}`} className="font-display font-semibold hover:underline cursor-pointer">
                            {invoice.invoiceNumber}
                          </Link>
                          <p className="text-xs text-text-muted">
                            {invoice._count?.items ?? invoice.items?.length ?? 0} line{(invoice._count?.items ?? 0) !== 1 ? 's' : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{invoice.company?.name ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs">{formatShortDate(invoice.issueDate)}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className="text-text-secondary">{formatShortDate(invoice.dueDate)}</span>
                          {late && <span className="block text-danger font-medium">{late}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(invoice.total)}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">
                          <span className="text-text-secondary">{formatPrice(invoice.paidAmount)} paid</span>
                          {invoice.status !== 'VOID' && outstanding > 0 && (
                            <span className="block font-medium text-text-primary">{formatPrice(outstanding)} due</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
                            {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-text-muted">
                  Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} invoice{pagination.total !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-surface-elevated text-text-secondary rounded-lg text-sm font-medium hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-surface-elevated text-text-secondary rounded-lg text-sm font-medium hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </FadeSwap>

      {showGenerate && (
        <GenerateInvoiceModal
          token={token!}
          onClose={() => setShowGenerate(false)}
          onGenerated={(invoiceId) => { setShowGenerate(false); router.push(`/admin/invoices/${invoiceId}`); }}
        />
      )}
    </div>
  );
}
