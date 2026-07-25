'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronDown, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminListBatches, adminListCampaigns, adminGetProducts } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { BATCH_STATUS_LABELS, BATCH_STATUS_COLORS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { Batch, BatchStatus, PreorderCampaign, Product } from '@/types';

type StatusFilter = BatchStatus | 'all';

export default function AdminBatchesPage() {
  const { token } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [campaigns, setCampaigns] = useState<PreorderCampaign[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [variantId, setVariantId] = useState('');
  const [campaignId, setCampaignId] = useState('');

  useEffect(() => {
    if (!token) return;
    adminListCampaigns(token, { limit: '200' }).then((r) => setCampaigns(r.data)).catch(() => {});
    adminGetProducts(token, { limit: '200' }).then((r) => setProducts(r.data)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (status !== 'all') params.status = status;
    if (variantId) params.variantId = variantId;
    if (campaignId) params.campaignId = campaignId;
    adminListBatches(token, params)
      .then((r) => setBatches(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, status, variantId, campaignId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Batches</h1>
        <Link href="/admin/batches/new"><Button><Plus className="w-4 h-4" /> New Batch</Button></Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-sm bg-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-secondary max-w-xs"
          >
            <option value="">All Variants</option>
            {products.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.variants.map((v) => (
                  <option key={v.id} value={v.id}>{p.name} {v.size ?? ''} ({v.code})</option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-sm bg-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-secondary"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-sm bg-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-secondary"
          >
            <option value="all">All Statuses</option>
            {(['INCOMING', 'IN_STOCK', 'DEPLETED'] as const).map((s) => (
              <option key={s} value={s}>{BATCH_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${variantId}:${campaignId}:${batches.length}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : batches.length === 0 ? (
          <p className="text-text-muted py-8 text-center">No batches found.</p>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Batch #</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Variant</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Campaign</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Expiry</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Quantity</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Edit</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-surface-elevated/50">
                    <td className="px-4 py-3 font-medium">{b.batchNumber}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{b.variant ? `${b.variant.product.name} ${b.variant.size ?? ''}` : '—'}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{b.campaign?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(b.expiry)}</td>
                    <td className="px-4 py-3 text-center">{b.quantity}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={BATCH_STATUS_COLORS[b.status]}>{BATCH_STATUS_LABELS[b.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/admin/batches/${b.id}`} className="p-1.5 hover:bg-surface-elevated rounded cursor-pointer inline-flex" title="Edit">
                        <Pencil className="w-4 h-4 text-text-muted" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FadeSwap>
    </div>
  );
}
