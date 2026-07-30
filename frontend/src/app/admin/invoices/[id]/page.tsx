'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, Building2, ExternalLink, Layers } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminGetInvoice, adminGetOrder, adminRecordPayment, adminVoidInvoice } from '@/lib/api';
import { formatPrice, formatDate, formatShortDate } from '@/lib/utils';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, CREDIT_TERMS_LABELS } from '@/lib/constants';
import { companyLabel } from '@/lib/company';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { errorMessage, overdueLabel, PAYMENT_METHOD_LABELS } from '../utils';
import type { Invoice, InvoiceItem } from '@/types';

function itemDisplayName(orderItem: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (orderItem.variant) return `${orderItem.variant.product.name}${orderItem.variant.size ? ` ${orderItem.variant.size}` : ''}`;
  if (orderItem.kit) return orderItem.kit.name;
  return 'Item';
}


function RecordPaymentForm({ invoice, token, onDone }: { invoice: Invoice; token: string; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'WHATSAPP' | 'BILLPLZ'>('WHATSAPP');
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const outstanding = invoice.total - invoice.paidAmount;

  const handleSubmit = async () => {
    // The input is a decimal ringgit figure; the API takes integer sen.
    const sen = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(sen) || sen < 1) { setError('Enter an amount greater than zero.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await adminRecordPayment(token, invoice.id, { amount: sen, method, paymentRef: paymentRef || undefined });
      setAmount('');
      setPaymentRef('');
      onDone();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to record payment'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
      <h2 className="font-display font-semibold text-lg mb-1">Record Payment</h2>
      <p className="text-xs text-text-muted mb-4">
        For payments confirmed off-platform. {formatPrice(outstanding)} still outstanding.
      </p>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label htmlFor="payment-amount" className="block text-xs font-medium text-text-secondary mb-1">Amount (RM)</label>
          <input
            id="payment-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
        <div>
          <label htmlFor="payment-method" className="block text-xs font-medium text-text-secondary mb-1">Method</label>
          <select
            id="payment-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as 'WHATSAPP' | 'BILLPLZ')}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
          >
            <option value="WHATSAPP">{PAYMENT_METHOD_LABELS.WHATSAPP}</option>
            <option value="BILLPLZ">{PAYMENT_METHOD_LABELS.BILLPLZ}</option>
          </select>
        </div>
        <div>
          <label htmlFor="payment-ref" className="block text-xs font-medium text-text-secondary mb-1">Reference (optional)</label>
          <input
            id="payment-ref"
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="e.g. MBB TRF 8823"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
      </div>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={!amount || submitting}>
          {submitting ? 'Saving...' : 'Record Payment'}
        </Button>
        {outstanding > 0 && (
          <Button
            size="sm"
            variant="ghost"
            // Sen -> editable decimal for the number input; display anywhere
            // else always goes through formatPrice.
            onClick={() => setAmount((outstanding / 100).toFixed(2))}
          >
            Fill full amount
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const { token } = useAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    adminGetInvoice(token, invoiceId)
      .then(setInvoice)
      .catch(() => setError('Invoice not found'))
      .finally(() => setLoading(false));
  }, [token, invoiceId]);

  useEffect(load, [load]);

  // The invoice detail response carries each line's shipment + orderId but not
  // the human order NUMBER, and lineage is the whole point of a consolidated
  // invoice ("this line came from order X") — so resolve the numbers for the
  // handful of distinct orders this invoice touches.
  useEffect(() => {
    if (!token || !invoice) return;
    const orderIds = [...new Set((invoice.items ?? []).map((i) => i.shipmentItem?.shipment.orderId).filter((id): id is string => !!id))];
    const missing = orderIds.filter((id) => !orderNumbers[id]);
    if (missing.length === 0) return;
    Promise.all(missing.map((id) => adminGetOrder(token, id).then((o) => [id, o.orderNumber] as const).catch(() => null)))
      .then((results) => {
        const resolved = Object.fromEntries(results.filter((r): r is readonly [string, string] => r !== null));
        if (Object.keys(resolved).length > 0) setOrderNumbers((prev) => ({ ...prev, ...resolved }));
      });
    // orderNumbers is deliberately not a dep — it's what this effect writes,
    // and re-running on its own output would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, invoice]);

  // Lines grouped by the order they trace back to.
  const groups = useMemo(() => {
    const byOrder = new Map<string, { orderId: string; rows: InvoiceItem[] }>();
    for (const item of invoice?.items ?? []) {
      const orderId = item.shipmentItem?.shipment.orderId ?? 'unknown';
      const entry = byOrder.get(orderId) ?? { orderId, rows: [] };
      entry.rows.push(item);
      byOrder.set(orderId, entry);
    }
    return [...byOrder.values()];
  }, [invoice]);

  const handleVoid = async () => {
    setVoiding(true);
    try {
      await adminVoidInvoice(token!, invoiceId);
      setConfirmVoid(false);
      load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to void invoice'));
    } finally {
      setVoiding(false);
    }
  };

  if (loading) return <p className="text-sm text-text-secondary">Loading invoice...</p>;

  if (error || !invoice) {
    return (
      <div>
        <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Invoice not found'}</p>
      </div>
    );
  }

  const outstanding = invoice.total - invoice.paidAmount;
  const late = overdueLabel(invoice.dueDate, invoice.status);

  return (
    <div>
      <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Invoices
      </Link>

      {invoice.void && (
        <div className="flex items-start gap-2.5 rounded-xl border-2 border-danger bg-red-50 px-4 py-3 mb-6">
          <Ban className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="font-display font-bold text-danger">This invoice has been voided</p>
            <p className="text-sm text-danger/80">
              It no longer counts toward receivables, and its shipment items can be re-invoiced.
            </p>
          </div>
        </div>
      )}

      <div className={invoice.void ? 'opacity-60' : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className={invoice.void
              ? 'font-display text-2xl sm:text-3xl font-bold line-through decoration-danger decoration-2'
              : 'font-display text-2xl sm:text-3xl font-bold'}
            >
              {invoice.invoiceNumber}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Issued {formatShortDate(invoice.issueDate)} &middot; Due {formatShortDate(invoice.dueDate)}
              {late && <span className="text-danger font-medium"> &middot; {late}</span>}
            </p>
          </div>
          <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
            {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-text-muted" />
              <h2 className="font-display font-semibold text-lg">Bill To</h2>
            </div>
            {invoice.company ? (
              <>
                <Link href={`/admin/companies/${invoice.company.id}`} className="text-sm font-medium hover:underline cursor-pointer">
                  {companyLabel(invoice.company)}
                </Link>
                <p className="text-xs text-text-muted mt-1">
                  Credit Terms: {CREDIT_TERMS_LABELS[invoice.company.creditTerms]}
                </p>
              </>
            ) : (
              <p className="text-sm text-text-secondary">—</p>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Total</p>
                <p className="font-display text-xl font-bold tabular-nums">{formatPrice(invoice.total)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Paid</p>
                <p className="font-display text-xl font-bold text-success tabular-nums">{formatPrice(invoice.paidAmount)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Outstanding</p>
                <p className={outstanding > 0 && !invoice.void
                  ? 'font-display text-xl font-bold text-danger tabular-nums'
                  : 'font-display text-xl font-bold tabular-nums'}
                >
                  {formatPrice(Math.max(0, outstanding))}
                </p>
              </div>
            </div>
          </div>

          {/* Line items, grouped by the order each traces back to — a
              consolidated invoice is only legible if every line says which
              order, shipment and batch it came from. */}
          <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="font-display font-semibold text-lg">Line Items</h2>
              {groups.length > 1 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                  <Layers className="w-3.5 h-3.5 text-text-muted" />
                  Consolidated across {groups.length} orders
                </span>
              )}
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-text-secondary">This invoice has no line items.</p>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => {
                  const subtotal = group.rows.reduce((s, r) => s + r.amount, 0);
                  return (
                    <div key={group.orderId} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-elevated">
                        {group.orderId === 'unknown' ? (
                          <span className="font-display font-semibold text-sm">Unlinked</span>
                        ) : (
                          <Link
                            href={`/admin/orders/${group.orderId}`}
                            className="inline-flex items-center gap-1.5 font-display font-semibold text-sm hover:underline cursor-pointer"
                          >
                            {orderNumbers[group.orderId] ?? 'Order'}
                            <ExternalLink className="w-3 h-3 text-text-muted" />
                          </Link>
                        )}
                        <span className="text-sm font-semibold tabular-nums">{formatPrice(subtotal)}</span>
                      </div>
                      <div className="divide-y divide-border">
                        {group.rows.map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {row.shipmentItem?.orderItem ? itemDisplayName(row.shipmentItem.orderItem) : 'Item'}
                              </p>
                              <p className="text-xs text-text-muted">
                                {row.shipmentItem
                                  ? `${row.shipmentItem.shipment.shipmentNumber} · Batch ${row.shipmentItem.batch.batchNumber} · Qty ${row.shipmentItem.quantity}`
                                  : 'Lineage unavailable'}
                              </p>
                            </div>
                            <span className="text-sm font-semibold shrink-0 tabular-nums">{formatPrice(row.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Payments</h2>
            {(invoice.payments ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">No payments recorded against this invoice yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {invoice.payments!.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{PAYMENT_METHOD_LABELS[payment.method]}</p>
                      <p className="text-xs text-text-muted">
                        {formatDate(payment.paidAt)}{payment.paymentRef ? ` · Ref ${payment.paymentRef}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold shrink-0 tabular-nums">{formatPrice(payment.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!invoice.void && invoice.status !== 'PAID' && (
            <RecordPaymentForm invoice={invoice} token={token!} onDone={load} />
          )}

          {!invoice.void && (
            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
              <h2 className="font-display font-semibold text-lg mb-1">Void Invoice</h2>
              <p className="text-xs text-text-muted mb-4">
                Removes this invoice from receivables and frees its shipment items to be billed again. This cannot be undone.
              </p>
              {confirmVoid ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-danger font-medium mr-1">Void {invoice.invoiceNumber}?</p>
                  <Button size="sm" variant="danger" onClick={handleVoid} disabled={voiding}>
                    {voiding ? 'Voiding...' : 'Yes, void it'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmVoid(false)} disabled={voiding}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmVoid(true)}>
                  <Ban className="w-3.5 h-3.5" /> Void Invoice
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
