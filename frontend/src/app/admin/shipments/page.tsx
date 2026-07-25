'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight, Truck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminListShipments } from '@/lib/api';
import { formatShortDate, cn } from '@/lib/utils';
import { rowLink } from '@/lib/row-link';
import { Badge } from '@/components/ui/Badge';
import { StatusFilterPills } from '@/components/orders/StatusFilterPills';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { AdminShipment, PaginatedResponse } from '@/types';

const LIMIT = 25;

// `status` is the server's param, not a client-side filter — PENDING means
// shippedAt IS NULL (still being packed), SHIPPED means it's gone out. That
// split is the whole point of the worklist, so it opens on PENDING.
const SHIPMENT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: '', label: 'All' },
];

// The list endpoint eager-loads the order's company and shipping address (see
// adminListShipments in admin-shipments.controller.ts), and returns a
// { pendingCount } summary — neither is expressed on `AdminShipment` /
// `adminListShipments` in the shared contracts, which another agent owns, so
// this narrows the response locally rather than editing those.
interface ShipmentRow extends Omit<AdminShipment, 'order'> {
  order?: {
    id: string;
    orderNumber: string;
    companyId?: string;
    company?: { name: string };
    shippingAddress?: { label: string; city: string; state: string } | null;
  } | null;
}

interface ShipmentsResponse {
  data: ShipmentRow[];
  pagination: PaginatedResponse<AdminShipment>['pagination'];
  summary?: { pendingCount: number };
}

export default function AdminShipmentsPage() {
  const router = useRouter();
  const { token } = useAuth();

  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<AdminShipment>['pagination'] | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('PENDING');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

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
    adminListShipments(token, params)
      .then((r) => {
        const res = r as unknown as ShipmentsResponse;
        setShipments(res.data);
        setPagination(res.pagination);
        if (res.summary) setPendingCount(res.summary.pendingCount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, status, debouncedSearch, page]);

  useEffect(load, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-2xl font-bold">Shipments</h1>
        <p className="text-sm text-text-muted">
          {pendingCount === null
            ? ' '
            : `${pendingCount} shipment${pendingCount !== 1 ? 's' : ''} still to go out`}
        </p>
      </div>

      <div className="relative w-full max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search by shipment #, order #, company or tracking..."
          value={search}
          // Any change to what's being asked for restarts at page 1 —
          // otherwise a filter applied from page 3 lands on an empty page.
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      <div className="mb-6">
        <StatusFilterPills
          options={SHIPMENT_FILTER_OPTIONS.map((o) =>
            o.value === 'PENDING' && pendingCount !== null ? { ...o, count: pendingCount } : o
          )}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
        />
      </div>

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${debouncedSearch}:${page}`}>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-surface-elevated rounded-xl" />)}
          </div>
        ) : shipments.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted text-lg mb-1">No shipments found</p>
            <p className="text-text-muted text-sm">
              {debouncedSearch
                ? 'Try a different search term.'
                : status === 'PENDING'
                  ? 'Nothing is waiting to ship — every shipment has gone out.'
                  : status
                    ? 'No shipments with this status.'
                    : 'Shipments are created from an order’s Shipments tab.'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated">
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Shipment #</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Order</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Destination</th>
                    <th className="px-4 py-3 text-center font-medium text-text-secondary">Items</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Created</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Shipped</th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">Carrier / Tracking</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => {
                    const address = shipment.order?.shippingAddress;
                    // No separate shipment detail page on purpose — picking
                    // batches and marking shipped already live on the order's
                    // Shipments tab, and a second copy would diverge.
                    const href = shipment.order ? `/admin/orders/${shipment.order.id}` : undefined;
                    return (
                      <tr
                        key={shipment.id}
                        {...(href ? rowLink(() => router.push(href)) : {})}
                        className={cn(
                          'border-b border-border last:border-0 hover:bg-surface-elevated/50',
                          href && 'cursor-pointer'
                        )}
                      >
                        <td className="px-4 py-3">
                          {href ? (
                            <Link href={href} className="font-display font-semibold hover:underline cursor-pointer">
                              {shipment.shipmentNumber}
                            </Link>
                          ) : (
                            <span className="font-display font-semibold">{shipment.shipmentNumber}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{shipment.order?.orderNumber ?? '—'}</p>
                          <p className="text-xs text-text-muted">{shipment.order?.company?.name ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs">
                          {address ? (
                            <>
                              <span className="block text-text-primary font-medium">{address.label}</span>
                              {address.city}, {address.state}
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-text-secondary">{shipment.items?.length ?? 0}</td>
                        <td className="px-4 py-3 text-text-secondary text-xs">{formatShortDate(shipment.createdAt)}</td>
                        <td className="px-4 py-3 text-xs">
                          {shipment.shippedAt ? (
                            <Badge className="bg-green-100 text-green-800">{formatShortDate(shipment.shippedAt)}</Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800">Not shipped</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {shipment.carrier || shipment.trackingNumber ? (
                            <>
                              <span className="block text-text-primary">{shipment.carrier ?? '—'}</span>
                              <span className="text-text-muted">{shipment.trackingNumber ?? 'No tracking number'}</span>
                            </>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
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
                  Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} shipment{pagination.total !== 1 ? 's' : ''}
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
    </div>
  );
}
