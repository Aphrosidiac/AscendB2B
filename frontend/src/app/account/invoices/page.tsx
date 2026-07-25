'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt, TriangleAlert } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { listCompanyInvoices } from '@/lib/api';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { invoiceOutstanding, daysPastDue, summariseInvoices } from '@/lib/invoices';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, CREDIT_TERMS_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Animate, Stagger } from '@/components/ui/Animate';
import { StatusFilterPills, type StatusFilterOption } from '@/components/orders/StatusFilterPills';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { Invoice, InvoiceReceivablesSummary } from '@/types';

// The company invoice endpoint caps `limit` at 100 (backend/src/utils/pagination.ts).
const PAGE_SIZE = 100;

type FilterValue = 'ALL' | 'OUTSTANDING' | 'OVERDUE' | 'PAID' | 'VOID';

function matchesFilter(invoice: Invoice, filter: FilterValue): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'OUTSTANDING':
      return invoiceOutstanding(invoice) > 0;
    case 'OVERDUE':
      return daysPastDue(invoice) > 0;
    case 'PAID':
      return !invoice.void && invoiceOutstanding(invoice) === 0;
    case 'VOID':
      return invoice.void;
  }
}

export default function InvoicesListPage() {
  const router = useRouter();
  const { token, company, loading: authLoading, isAuthenticated } = useCompanyAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [serverSummary, setServerSummary] = useState<InvoiceReceivablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterValue>('ALL');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/account/invoices');
  }, [authLoading, isAuthenticated, router]);

  // One fetch, filtered client-side: listMyInvoices has no `status` param
  // (see backend/src/modules/companies/company-invoices.controller.ts — its
  // `where` only takes companyId/orderId, and status is computed after the
  // query), so there is nothing to re-fetch per pill.
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    listCompanyInvoices(token, { limit: String(PAGE_SIZE) })
      .then((res) => {
        setInvoices(res.data);
        setTotal(res.pagination.total);
        setServerSummary(res.summary ?? null);
      })
      .catch(() => setError('Failed to load invoices'))
      .finally(() => setLoading(false));
  }, [token]);

  // Prefer the server's account-wide rollup: it covers every invoice, not
  // just the page in hand. summariseInvoices stays as the fallback so the
  // page still renders a number if an older backend omits the field.
  const derived = useMemo(() => summariseInvoices(invoices), [invoices]);
  const summary = serverSummary
    ? {
        outstanding: serverSummary.outstandingAmount,
        overdue: serverSummary.overdueAmount,
        overdueCount: serverSummary.overdueCount,
      }
    : derived;

  const options: StatusFilterOption<FilterValue>[] = useMemo(
    () =>
      (
        [
          ['ALL', 'All'],
          ['OUTSTANDING', 'Outstanding'],
          ['OVERDUE', 'Overdue'],
          ['PAID', 'Paid'],
          ['VOID', 'Void'],
        ] as const
      ).map(([value, label]) => ({
        value,
        label,
        count: invoices.filter((i) => matchesFilter(i, value)).length,
      })),
    [invoices]
  );

  const visible = useMemo(() => invoices.filter((i) => matchesFilter(i, filter)), [invoices, filter]);

  // The summary above is derived from the rows actually fetched, not a
  // server-side rollup (the company endpoint returns none) — so if there are
  // more invoices than one page holds, say so rather than passing this off as
  // an account-wide balance.
  // Only a caveat when the totals are the locally-derived fallback; the
  // server rollup already covers every invoice on the account.
  const partial = !serverSummary && total > invoices.length;

  if (authLoading || !isAuthenticated) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Account
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <h1 className="font-display text-3xl font-bold mb-6">Invoices</h1>
      </Animate>

      <Animate variant="fadeUp" delay={0.05} duration={0.5} className="mb-6">
        <div
          className={cn(
            'rounded-xl border p-5 sm:p-6',
            summary.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-surface border-border'
          )}
        >
          <div className="grid sm:grid-cols-3 gap-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Total Outstanding</p>
              <p className="font-display text-3xl font-bold tabular-nums">
                {loading ? '—' : formatPrice(summary.outstanding)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Overdue</p>
              <p className={cn('font-display text-3xl font-bold tabular-nums', summary.overdue > 0 ? 'text-danger' : 'text-text-primary')}>
                {loading ? '—' : formatPrice(summary.overdue)}
              </p>
              {summary.overdueCount > 0 && (
                <p className="text-xs text-danger font-medium mt-1">
                  {summary.overdueCount} invoice{summary.overdueCount === 1 ? '' : 's'} past due
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Payment Terms</p>
              <p className="font-display text-3xl font-bold">
                {company ? CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms : '—'}
              </p>
              <p className="text-xs text-text-muted mt-1">Sets the due date on every invoice</p>
            </div>
          </div>

          {summary.overdue > 0 && (
            <div className="mt-5 pt-4 border-t border-red-200 flex items-start gap-2 text-sm text-danger">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                {formatPrice(summary.overdue)} is past its due date. Please settle these to keep your credit terms active — reach
                out to your account contact if you need a payment reference.
              </p>
            </div>
          )}

          {partial && (
            <p className="mt-4 text-xs text-text-muted">
              Totals cover your {invoices.length} most recent invoices of {total}. Contact us for a full statement of account.
            </p>
          )}
        </div>
      </Animate>

      <Animate variant="fadeUp" delay={0.1} duration={0.4} className="mb-6">
        <StatusFilterPills options={options} value={filter} onChange={setFilter} />
      </Animate>

      {error && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4">{error}</p>}

      <FadeSwap swapKey={loading ? 'loading' : `${filter}:${visible.length}`}>
        {loading ? (
          <p className="text-sm text-text-secondary">Loading invoices...</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
            <Receipt className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary">
              {invoices.length === 0
                ? "You don't have any invoices yet — these are raised once your order ships."
                : 'No invoices match this filter.'}
            </p>
          </div>
        ) : (
          <Stagger className="space-y-3" stagger={0.06}>
            {visible.map((invoice) => {
              const owed = invoiceOutstanding(invoice);
              const late = daysPastDue(invoice);
              return (
                <Link
                  key={invoice.id}
                  href={`/account/invoices/${invoice.id}`}
                  className={cn(
                    'block bg-surface rounded-xl border p-4 sm:p-5 hover:shadow-sm transition-all',
                    late > 0 ? 'border-red-200 hover:border-red-300' : 'border-border hover:border-border-hover'
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-text-muted">
                        Issued {formatDate(invoice.issueDate)} &middot; Due {formatDate(invoice.dueDate)}
                      </p>
                      {late > 0 && (
                        <p className="text-xs font-semibold text-danger mt-1">
                          {late} day{late === 1 ? '' : 's'} overdue
                        </p>
                      )}
                    </div>
                    <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
                      {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border text-sm">
                    <div>
                      <p className="text-xs text-text-muted">Invoiced</p>
                      <p className="font-medium tabular-nums">{formatPrice(invoice.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Paid</p>
                      <p className="font-medium tabular-nums text-text-secondary">{formatPrice(invoice.paidAmount)}</p>
                    </div>
                    <div className="text-right sm:text-left">
                      <p className="text-xs text-text-muted">Outstanding</p>
                      <p className={cn('font-display font-bold tabular-nums', late > 0 && 'text-danger')}>
                        {formatPrice(owed)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </Stagger>
        )}
      </FadeSwap>
    </div>
  );
}
