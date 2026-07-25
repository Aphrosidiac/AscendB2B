'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminListCompanies } from '@/lib/api';
import { CREDIT_TERMS_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { AdminCompany } from '@/types';

export default function AdminCompaniesPage() {
  const { token } = useAuth();
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (search) params.search = search;
    adminListCompanies(token, params)
      .then((r) => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Companies</h1>
        <p className="text-sm text-text-muted">{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</p>
      </div>

      <div className="relative w-full max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${search}:${companies.length}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : companies.length === 0 ? (
          <p className="text-text-muted py-8 text-center">No companies found.</p>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Contact</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Credit Terms</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Orders</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Quotations</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-elevated/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/companies/${c.id}`} className="font-medium hover:underline cursor-pointer">{c.name}</Link>
                      <p className="text-xs text-text-muted">{c.email}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{c.contactName}<br />{c.phone}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={c.creditTerms === 'PREPAID' ? 'bg-gray-100 text-gray-800' : 'bg-green-100 text-green-800'}>
                        {CREDIT_TERMS_LABELS[c.creditTerms]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">{c._count?.orders ?? 0}</td>
                    <td className="px-4 py-3 text-center">{c._count?.quotations ?? 0}</td>
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
