'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Pencil, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminListKits } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { Kit } from '@/types';

type ActiveFilter = 'all' | 'active' | 'inactive';

export default function AdminKitsPage() {
  const { token } = useAuth();
  const [kits, setKits] = useState<Kit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (search) params.search = search;
    if (activeFilter !== 'all') params.active = activeFilter === 'active' ? 'true' : 'false';
    adminListKits(token, params)
      .then((r) => setKits(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, search, activeFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Kits</h1>
        <Link href="/admin/kits/new"><Button><Plus className="w-4 h-4" /> New Kit</Button></Link>
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
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-sm bg-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-secondary"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${search}:${activeFilter}:${kits.length}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : kits.length === 0 ? (
          <p className="text-text-muted py-8 text-center">No kits found.</p>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Name</th>
                  <th className="px-4 py-3 text-right font-medium text-text-secondary">Price</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Qty/Kit</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Campaign</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Components</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Edit</th>
                </tr>
              </thead>
              <tbody>
                {kits.map((k) => (
                  <tr key={k.id} className="border-b border-border last:border-0 hover:bg-surface-elevated/50">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatPrice(k.pricePerKit)}</td>
                    <td className="px-4 py-3 text-center">{k.qtyPerKit}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{k.campaign?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center">{k.items.length}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={k.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {k.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/admin/kits/${k.id}`} className="p-1.5 hover:bg-surface-elevated rounded cursor-pointer inline-flex" title="Edit">
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
