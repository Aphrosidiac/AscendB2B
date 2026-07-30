'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, FileDown, MapPin, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminGetOrder, adminUpdateOrder, adminOpenReceiptPdf } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { companyLabel } from '@/lib/company';
import {
  COMPANY_ORDER_STATUS_LABELS,
  COMPANY_ORDER_STATUS_COLORS,
  CREDIT_TERMS_LABELS,
} from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { OrderStepper } from '@/components/orders/OrderStepper';
import { TabBar, type TabBarTab } from '@/components/orders/TabBar';
import { FadeSwap } from '@/components/orders/FadeSwap';
import { ShipmentsTab } from './ShipmentsTab';
import { InvoicesTab } from './InvoicesTab';
import type { AdminOrder, CompanyOrderStatus } from '@/types';

type Tab = 'info' | 'items' | 'shipments' | 'invoices' | 'files' | 'history';

const TABS: TabBarTab<Tab>[] = [
  { value: 'info', label: 'Order Info' },
  { value: 'items', label: 'Items' },
  { value: 'shipments', label: 'Shipments' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'files', label: 'Files' },
  { value: 'history', label: 'History' },
];

const ORDER_STATUSES: CompanyOrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKING', 'SHIPPED', 'PARTIALLY_SHIPPED', 'DELIVERED', 'COMPLETE', 'CANCELLED'];

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

function StatusChangePanel({ order, token, onUpdated }: { order: AdminOrder; token: string; onUpdated: () => void }) {
  const [status, setStatus] = useState<CompanyOrderStatus>(order.status);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (status === order.status) return;
    setSubmitting(true);
    setError('');
    try {
      await adminUpdateOrder(token, order.id, { status, note: note || undefined });
      setNote('');
      onUpdated();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data?.error ?? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message ?? 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
      <h2 className="font-display font-semibold text-lg mb-4">Change Status</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">New Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CompanyOrderStatus)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface font-medium"
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{COMPANY_ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Note (optional, logged to history)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Confirmed stock and pricing"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
      </div>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <Button size="sm" onClick={handleSubmit} disabled={status === order.status || submitting}>
        {submitting ? 'Updating...' : 'Update Status'}
      </Button>
    </div>
  );
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { token } = useAuth();

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('info');

  const load = () => {
    if (!token) return;
    adminGetOrder(token, orderId)
      .then(setOrder)
      .catch(() => setError('Order not found'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, orderId]);

  if (loading) {
    return <p className="text-sm text-text-secondary">Loading order...</p>;
  }

  if (error || !order) {
    return (
      <div>
        <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Orders
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Order not found'}</p>
      </div>
    );
  }

  // Every batch (with a COA) referenced by any shipment item on this order —
  // same Files-tab convention as the company-facing order detail page.
  const coaBatches = new Map<string, { batchNumber: string; expiry: string; coaUrl: string }>();
  for (const shipment of order.shipments ?? []) {
    for (const item of shipment.items) {
      if (item.batch?.coaUrl) coaBatches.set(item.batch.batchNumber, { ...item.batch, coaUrl: item.batch.coaUrl });
    }
  }

  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-text-muted mt-1">Placed {formatDate(order.createdAt)} by {companyLabel(order.company)}</p>
        </div>
        <Badge className={COMPANY_ORDER_STATUS_COLORS[order.status]}>
          {COMPANY_ORDER_STATUS_LABELS[order.status] ?? order.status}
        </Badge>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 mb-8">
        <OrderStepper status={order.status} />
      </div>

      <TabBar tabs={TABS} value={tab} onChange={setTab} className="mb-6" />

      <FadeSwap swapKey={tab}>
        {tab === 'info' && (
          <div className="space-y-4">
            <StatusChangePanel order={order} token={token!} onUpdated={load} />

            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-text-muted" />
                <h2 className="font-display font-semibold text-lg">Company</h2>
              </div>
              <p className="text-sm font-medium">{companyLabel(order.company)}</p>
              <p className="text-sm text-text-secondary">
                {order.company.contactName ? `${order.company.contactName} · ` : ''}{order.company.email}
              </p>
              <p className="text-xs text-text-muted mt-1">Credit Terms: {CREDIT_TERMS_LABELS[order.company.creditTerms]}</p>
            </div>

            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
              <h2 className="font-display font-semibold text-lg mb-4">Order Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal</span>
                  <span>{formatPrice(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Shipping</span>
                  <span>{order.shippingFee > 0 ? formatPrice(order.shippingFee) : 'Free'}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount {order.discountCode ? `(${order.discountCode.code})` : ''}</span>
                    <span>-{formatPrice(order.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-display font-bold text-base pt-2 border-t border-border">
                  <span>Total</span>
                  <span>{formatPrice(order.total)}</span>
                </div>
              </div>
              {order.notes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Notes</p>
                  <p className="text-sm text-text-secondary">{order.notes}</p>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => token && adminOpenReceiptPdf(token, order.id)}>
                  <FileDown className="w-3.5 h-3.5" /> Download Receipt
                </Button>
              </div>
            </div>

            {order.shippingAddress && (
              <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-text-muted" />
                  <h2 className="font-display font-semibold text-lg">Shipping Address</h2>
                </div>
                <p className="text-sm font-medium mb-1">{order.shippingAddress.label}</p>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}<br />
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postcode}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'items' && (
          <div className="bg-surface rounded-xl border border-border divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{itemDisplayName(item)}</p>
                  <p className="text-xs text-text-muted">
                    {item.variant?.code ?? ''} &middot; Qty {item.quantity} &times; {formatPrice(item.unitPrice)}
                  </p>
                </div>
                <p className="font-display font-semibold shrink-0">{formatPrice(item.unitPrice * item.quantity)}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'shipments' && (
          <ShipmentsTab order={order} token={token!} onRefresh={load} />
        )}

        {tab === 'invoices' && (
          <InvoicesTab order={order} token={token!} />
        )}

        {tab === 'files' && (
          <div className="space-y-3">
            {coaBatches.size === 0 ? (
              <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
                <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No Certificates of Analysis are available yet — these appear once shipment items reference a batch.</p>
              </div>
            ) : (
              [...coaBatches.values()].map((batch) => (
                <a
                  key={batch.batchNumber}
                  href={batch.coaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 bg-surface rounded-xl border border-border p-4 sm:p-5 hover:border-border-hover transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-text-muted" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">Certificate of Analysis</p>
                      <p className="text-xs text-text-muted">Batch {batch.batchNumber} &middot; Exp {formatDate(batch.expiry)}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-text-secondary shrink-0">View</span>
                </a>
              ))
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="bg-surface rounded-xl border border-border divide-y divide-border">
            {(order.statusHistory ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary p-5">No history recorded yet.</p>
            ) : (
              order.statusHistory!.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 p-4 sm:p-5">
                  <div>
                    <p className="text-sm font-medium">{COMPANY_ORDER_STATUS_LABELS[entry.status] ?? entry.status}</p>
                    {entry.note && <p className="text-xs text-text-secondary mt-0.5">{entry.note}</p>}
                  </div>
                  <span className="text-xs text-text-muted shrink-0">{formatDate(entry.changedAt)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </FadeSwap>
    </div>
  );
}
