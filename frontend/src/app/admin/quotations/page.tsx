'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { adminListQuotations } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { rowLink } from '@/lib/row-link';
import { QUOTATION_FILTER_OPTIONS, QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS } from '@/lib/constants';
import { companyLabel } from '@/lib/company';
import { Badge } from '@/components/ui/Badge';
import { StatusFilterPills } from '@/components/orders/StatusFilterPills';
import { FadeSwap } from '@/components/orders/FadeSwap';
import { getQuoteValidity, ValidityChip } from '@/components/quotations/QuotationProgress';
import type { Quotation, QuotationStatus } from '@/types';

type FilterValue = QuotationStatus | '';

export default function AdminQuotationsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<FilterValue>('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (status) params.status = status;
    adminListQuotations(token, params)
      .then((r) => setQuotations(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Quotations</h1>
        <p className="text-sm text-text-muted">{quotations.length} quotation{quotations.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="mb-6">
        <StatusFilterPills options={QUOTATION_FILTER_OPTIONS} value={status} onChange={(v) => setStatus(v as FilterValue)} />
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${quotations.length}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : quotations.length === 0 ? (
          <p className="text-text-muted py-8 text-center">No quotations found.</p>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Quote #</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Valid Until</th>
                  <th className="px-4 py-3 text-right font-medium text-text-secondary">Total</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q) => {
                  const validity = getQuoteValidity(q.status, q.validUntil);
                  return (
                    <tr key={q.id} {...rowLink(() => router.push(`/admin/quotations/${q.id}`))} className="border-b border-border last:border-0 hover:bg-surface-elevated/50 cursor-pointer">
                      <td className="px-4 py-3">
                        <Link href={`/admin/quotations/${q.id}`} className="font-display font-semibold hover:underline cursor-pointer">{q.quoteNumber}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{q.company ? companyLabel(q.company) : '—'}</p>
                        <p className="text-xs text-text-muted">{q.company?.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-text-secondary text-xs">{formatDate(q.validUntil).split(',')[0]}</p>
                        {!validity.settled && <ValidityChip validity={validity} className="mt-1" />}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(q.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={QUOTATION_STATUS_COLORS[q.status]}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </FadeSwap>
    </div>
  );
}
