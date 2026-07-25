'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminListCampaigns } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_COLORS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { PreorderCampaign, CampaignStatus } from '@/types';

type StatusFilter = CampaignStatus | 'all';

export default function AdminCampaignsPage() {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<PreorderCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (status !== 'all') params.status = status;
    if (search) params.search = search;
    adminListCampaigns(token, params)
      .then((r) => setCampaigns(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, status, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Campaigns</h1>
        <Link href="/admin/campaigns/new"><Button><Plus className="w-4 h-4" /> New Campaign</Button></Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-sm bg-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-secondary"
          >
            <option value="all">All Statuses</option>
            {(['DRAFT', 'OPEN', 'CLOSED', 'SOLD_OUT'] as const).map((s) => (
              <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${search}:${campaigns.length}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-text-muted py-8 text-center">No campaigns found.</p>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Opens</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Closes</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Est. Arrival</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Batches</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Kits</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-elevated/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/campaigns/${c.id}`} className="font-medium hover:underline cursor-pointer">{c.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(c.opensAt)}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(c.closesAt)}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(c.estimatedArrival)}</td>
                    <td className="px-4 py-3 text-center">{c._count?.batches ?? 0}</td>
                    <td className="px-4 py-3 text-center">{c._count?.kits ?? 0}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={CAMPAIGN_STATUS_COLORS[c.status]}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
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
