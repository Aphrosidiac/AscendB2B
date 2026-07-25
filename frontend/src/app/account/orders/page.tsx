'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { listCompanyOrders } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { COMPANY_ORDER_STATUS_LABELS, COMPANY_ORDER_STATUS_COLORS, COMPANY_ORDER_FILTER_OPTIONS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Animate, Stagger } from '@/components/ui/Animate';
import { StatusFilterPills } from '@/components/orders/StatusFilterPills';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { CompanyOrder, CompanyOrderStatus } from '@/types';

type FilterValue = CompanyOrderStatus | '';

export default function OrdersListPage() {
  const router = useRouter();
  const { token, loading: authLoading, isAuthenticated } = useCompanyAuth();
  const [orders, setOrders] = useState<CompanyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<FilterValue>('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/account/orders');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    listCompanyOrders(token, status ? { status } : undefined)
      .then((res) => setOrders(res.data))
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false));
  }, [token, status]);

  if (authLoading || !isAuthenticated) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Account
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <h1 className="font-display text-3xl font-bold mb-6">Orders</h1>
      </Animate>

      <Animate variant="fadeUp" delay={0.05} duration={0.4} className="mb-6">
        <StatusFilterPills
          options={COMPANY_ORDER_FILTER_OPTIONS}
          value={status}
          onChange={(v) => setStatus(v as FilterValue)}
        />
      </Animate>

      {error && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4">{error}</p>}

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${orders.length}`}>
        {loading ? (
          <p className="text-sm text-text-secondary">Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
            <Package className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary mb-4">
              {status ? 'No orders match this filter.' : "You haven't placed any orders yet."}
            </p>
            {!status && (
              <Link href="/products">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary hover:underline cursor-pointer">
                  Browse Products
                </span>
              </Link>
            )}
          </div>
        ) : (
          <Stagger className="space-y-3" stagger={0.06}>
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/account/orders/${order.id}`}
                className="block bg-surface rounded-xl border border-border p-4 sm:p-5 hover:border-border-hover hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-display font-bold">{order.orderNumber}</p>
                    <p className="text-xs text-text-muted">{formatDate(order.createdAt)}</p>
                  </div>
                  <Badge className={COMPANY_ORDER_STATUS_COLORS[order.status]}>
                    {COMPANY_ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <p className="text-sm text-text-secondary">
                    {order.items.length} item{order.items.length === 1 ? '' : 's'}
                  </p>
                  <p className="font-display font-semibold">{formatPrice(order.total)}</p>
                </div>
              </Link>
            ))}
          </Stagger>
        )}
      </FadeSwap>
    </div>
  );
}
