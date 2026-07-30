'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDebounced } from '@/hooks/useDebounced';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { adminGetOrders } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { rowLink } from '@/lib/row-link';
import { Badge } from '@/components/ui/Badge';
import { StatusFilterPills } from '@/components/orders/StatusFilterPills';
import { FadeSwap } from '@/components/orders/FadeSwap';
import { COMPANY_ORDER_FILTER_OPTIONS, COMPANY_ORDER_STATUS_LABELS, COMPANY_ORDER_STATUS_COLORS } from '@/lib/constants';
import type { AdminOrder, CompanyOrderStatus } from '@/types';

type FilterValue = CompanyOrderStatus | '';

// Stable identity so the cache hook's fallback doesn't change every render.
const NO_ORDERS: AdminOrder[] = [];

export default function AdminOrdersPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [status, setStatus] = useState<FilterValue>('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const fetcher = useCallback(() => {
    const params: Record<string, string> = { limit: '50' };
    if (status) params.status = status;
    if (debouncedSearch) params.search = debouncedSearch;
    return adminGetOrders(token!, params).then((r) => r.data);
  }, [token, status, debouncedSearch]);

  const { data: orders, loading } = useCachedFetch(
    token ? `admin/orders|${status}|${debouncedSearch}` : null,
    fetcher,
    NO_ORDERS
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Orders</h1>
        <p className="text-sm text-text-muted">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by order #, company, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      <div className="mb-6">
        <StatusFilterPills
          options={COMPANY_ORDER_FILTER_OPTIONS}
          value={status}
          onChange={(v) => setStatus(v as FilterValue)}
        />
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${debouncedSearch}:${orders.length}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-lg mb-1">No orders found</p>
            <p className="text-text-muted text-sm">
              {debouncedSearch ? 'Try a different search term.' : status ? 'No orders with this status.' : 'Orders will appear here once companies start purchasing.'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Order #</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Date</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Items</th>
                  <th className="px-4 py-3 text-right font-medium text-text-secondary">Total</th>
                  <th className="px-4 py-3 text-center font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} {...rowLink(() => router.push(`/admin/orders/${order.id}`))} className="border-b border-border last:border-0 hover:bg-surface-elevated/50 cursor-pointer">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="font-display font-semibold hover:underline cursor-pointer">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{order.company.name}</p>
                      <p className="text-xs text-text-muted">{order.company.email}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(order.createdAt)}</td>
                    <td className="px-4 py-3 text-center text-text-secondary">{order.items.length}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatPrice(order.total)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={COMPANY_ORDER_STATUS_COLORS[order.status]}>
                        {COMPANY_ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
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
