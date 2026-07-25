'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, FileDown, Truck, MapPin } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { getCompanyOrder, listCompanyInvoices, companyOpenReceiptPdf } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import {
  COMPANY_ORDER_STATUS_LABELS,
  COMPANY_ORDER_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
} from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Animate } from '@/components/ui/Animate';
import { OrderStepper } from '@/components/orders/OrderStepper';
import { TabBar, type TabBarTab } from '@/components/orders/TabBar';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { CompanyOrder, Invoice } from '@/types';

type Tab = 'info' | 'items' | 'shipments' | 'invoices' | 'files' | 'history';

const TABS: TabBarTab<Tab>[] = [
  { value: 'info', label: 'Order Info' },
  { value: 'items', label: 'Items' },
  { value: 'shipments', label: 'Shipments' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'files', label: 'Files' },
  { value: 'history', label: 'History' },
];

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const router = useRouter();
  const { token, loading: authLoading, isAuthenticated } = useCompanyAuth();

  const [order, setOrder] = useState<CompanyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('info');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push(`/login?redirect=/account/orders/${orderId}`);
  }, [authLoading, isAuthenticated, orderId, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    getCompanyOrder(token, orderId)
      .then(setOrder)
      .catch(() => setError('Order not found'))
      .finally(() => setLoading(false));
  }, [token, orderId]);

  useEffect(() => {
    if (!token) return;
    listCompanyInvoices(token, { orderId })
      .then((res) => setInvoices(res.data))
      .catch(() => {})
      .finally(() => setInvoicesLoading(false));
  }, [token, orderId]);

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-text-secondary">Loading order...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Orders
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Order not found'}</p>
      </div>
    );
  }

  // Every batch (with a COA) referenced by any shipment item on this order —
  // no separate document table, per docs/erd-b2b.md: the Files tab is just
  // Batch.coaUrl for every batch this order's ShipmentItems reference.
  const coaBatches = new Map<string, { batchNumber: string; expiry: string; coaUrl: string }>();
  for (const shipment of order.shipments ?? []) {
    for (const item of shipment.items) {
      if (item.batch?.coaUrl) coaBatches.set(item.batch.batchNumber, { ...item.batch, coaUrl: item.batch.coaUrl });
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Orders
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">{order.orderNumber}</h1>
            <p className="text-sm text-text-muted mt-1">Placed {formatDate(order.createdAt)}</p>
          </div>
          <Badge className={COMPANY_ORDER_STATUS_COLORS[order.status]}>
            {COMPANY_ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </div>
      </Animate>

      <Animate variant="fadeUp" delay={0.05} duration={0.5} className="mb-8">
        <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
          <OrderStepper status={order.status} />
        </div>
      </Animate>

      <Animate variant="fadeUp" delay={0.1} duration={0.4} className="mb-6">
        <TabBar tabs={TABS} value={tab} onChange={setTab} />
      </Animate>

      <FadeSwap swapKey={tab}>
        {tab === 'info' && (
          <div className="space-y-4">
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
                <Button variant="outline" size="sm" onClick={() => token && companyOpenReceiptPdf(token, order.id)}>
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
          <div className="space-y-4">
            {(order.shipments ?? []).length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
                <Truck className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No shipments have been created for this order yet.</p>
              </div>
            ) : (
              order.shipments!.map((shipment) => (
                <div key={shipment.id} className="bg-surface rounded-xl border border-border p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="font-display font-semibold">{shipment.shipmentNumber}</p>
                    {shipment.shippedAt && <span className="text-xs text-text-muted">Shipped {formatDate(shipment.shippedAt)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-text-secondary mb-3">
                    <span>Carrier: <span className="text-text-primary font-medium">{shipment.carrier || '—'}</span></span>
                    <span>Tracking: <span className="text-text-primary font-medium">{shipment.trackingNumber || '—'}</span></span>
                  </div>
                  <div className="pt-3 border-t border-border space-y-1.5">
                    {shipment.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-text-secondary">
                          {item.orderItem ? itemDisplayName(item.orderItem) : 'Item'}
                        </span>
                        <span className="text-text-muted">Qty {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'invoices' && (
          <div className="space-y-3">
            {invoicesLoading ? (
              <p className="text-sm text-text-secondary">Loading invoices...</p>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
                <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No invoices have been raised for this order yet.</p>
              </div>
            ) : (
              invoices.map((invoice) => (
                <div key={invoice.id} className="bg-surface rounded-xl border border-border p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-display font-semibold">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-text-muted">
                        Issued {formatDate(invoice.issueDate)} &middot; Due {formatDate(invoice.dueDate)}
                      </p>
                    </div>
                    <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border">
                    <span className="text-text-secondary">Paid {formatPrice(invoice.paidAmount)} of {formatPrice(invoice.total)}</span>
                    <span className="font-display font-semibold">{formatPrice(invoice.total)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'files' && (
          <div className="space-y-3">
            {coaBatches.size === 0 ? (
              <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
                <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No Certificates of Analysis are available yet — these appear once your order has shipped.</p>
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
