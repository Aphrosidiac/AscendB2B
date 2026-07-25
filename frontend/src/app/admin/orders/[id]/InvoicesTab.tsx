'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { adminListInvoices, adminGetInvoice, adminGenerateInvoice, adminRecordPayment, adminVoidInvoice } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { AdminOrder, Invoice } from '@/types';

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

interface GenerateInvoiceModalProps {
  order: AdminOrder;
  token: string;
  alreadyInvoicedIds: Set<string>;
  onClose: () => void;
  onGenerated: () => void;
}

function GenerateInvoiceModal({ order, token, alreadyInvoicedIds, onClose, onGenerated }: GenerateInvoiceModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Every shipment item on this order not yet billed on another invoice —
  // spans every shipment regardless of shipped status, since nothing in the
  // schema ties invoicing to shippedAt (see admin-invoices.controller.ts).
  const candidates = useMemo(() => {
    const rows: { id: string; shipmentNumber: string; label: string; qty: number; amount: number }[] = [];
    for (const shipment of order.shipments ?? []) {
      for (const item of shipment.items) {
        if (alreadyInvoicedIds.has(item.id)) continue;
        const unitPrice = item.orderItem?.unitPrice ?? 0;
        rows.push({
          id: item.id,
          shipmentNumber: shipment.shipmentNumber,
          label: item.orderItem ? itemDisplayName(item.orderItem) : 'Item',
          qty: item.quantity,
          amount: item.quantity * unitPrice,
        });
      }
    }
    return rows;
  }, [order, alreadyInvoicedIds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const total = candidates.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.amount, 0);

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await adminGenerateInvoice(token, { shipmentItemIds: [...selected] });
      onGenerated();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data?.error ?? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message ?? 'Failed to generate invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-lg mb-4">Generate Invoice</h3>

        {candidates.length === 0 ? (
          <p className="text-sm text-text-secondary py-6 text-center">
            Every shipped item on this order has already been invoiced.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-surface-elevated cursor-pointer">
                <div className="flex items-center gap-2.5 min-w-0">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="cursor-pointer shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.label}</p>
                    <p className="text-xs text-text-muted">{c.shipmentNumber} &middot; Qty {c.qty}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold shrink-0">{formatPrice(c.amount)}</span>
              </label>
            ))}
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex justify-between text-sm font-display font-bold border-t border-border pt-3 mb-4">
            <span>Invoice Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        )}

        {error && <p className="text-sm text-danger mb-3">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={selected.size === 0 || submitting}>
            {submitting ? 'Generating...' : `Generate Invoice (${selected.size})`}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

interface RecordPaymentFormProps {
  invoiceId: string;
  token: string;
  onDone: () => void;
}

function RecordPaymentForm({ invoiceId, token, onDone }: RecordPaymentFormProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'WHATSAPP' | 'BILLPLZ'>('WHATSAPP');
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents < 1) return;
    setSubmitting(true);
    setError('');
    try {
      await adminRecordPayment(token, invoiceId, { amount: cents, method, paymentRef: paymentRef || undefined });
      setAmount('');
      setPaymentRef('');
      onDone();
    } catch {
      setError('Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-elevated rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Record Payment</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Amount (RM)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as 'WHATSAPP' | 'BILLPLZ')} className="px-2.5 py-1.5 border border-border rounded-lg text-sm bg-surface">
            <option value="WHATSAPP">Manual / Bank Transfer</option>
            <option value="BILLPLZ">Online Gateway</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Reference (optional)</label>
          <input
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            className="w-40 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={!amount || submitting}>{submitting ? 'Saving...' : 'Record'}</Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function InvoiceCard({ invoice, token, onChanged }: { invoice: Invoice; token: string; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const loadDetail = () => {
    setLoading(true);
    adminGetInvoice(token, invoice.id).then(setDetail).catch(() => {}).finally(() => setLoading(false));
  };

  const toggle = () => {
    if (!expanded && !detail) loadDetail();
    setExpanded((e) => !e);
  };

  const handleVoid = async () => {
    if (!confirm(`Void invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    setVoiding(true);
    try {
      await adminVoidInvoice(token, invoice.id);
      onChanged();
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5 cursor-pointer" onClick={toggle}>
        <div>
          <p className="font-display font-semibold">{invoice.invoiceNumber}</p>
          <p className="text-xs text-text-muted">
            Issued {formatDate(invoice.issueDate)} &middot; Due {formatDate(invoice.dueDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
          {expanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
        </div>
      </div>
      <div className="flex justify-between text-sm px-4 sm:px-5 pb-4">
        <span className="text-text-secondary">Paid {formatPrice(invoice.paidAmount)} of {formatPrice(invoice.total)}</span>
        <span className="font-display font-semibold">{formatPrice(invoice.total)}</span>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 sm:p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-text-secondary">Loading...</p>
          ) : detail ? (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Billed Items</p>
                {(detail.items ?? []).map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-text-secondary">
                      {item.shipmentItem?.orderItem ? itemDisplayName(item.shipmentItem.orderItem) : 'Item'}
                      {item.shipmentItem && <span className="text-xs text-text-muted"> &middot; Qty {item.shipmentItem.quantity}</span>}
                    </span>
                    <span>{formatPrice(item.amount)}</span>
                  </div>
                ))}
              </div>

              {(detail.payments ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Payments</p>
                  {detail.payments!.map((p) => (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span className="text-text-secondary">{formatDate(p.paidAt)} &middot; {p.method === 'WHATSAPP' ? 'Manual' : 'Gateway'}{p.paymentRef ? ` (${p.paymentRef})` : ''}</span>
                      <span>{formatPrice(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {!invoice.void && invoice.status !== 'PAID' && (
                <RecordPaymentForm invoiceId={invoice.id} token={token} onDone={() => { loadDetail(); onChanged(); }} />
              )}

              {!invoice.void && (
                <div className="pt-2 border-t border-border">
                  <Button size="sm" variant="danger" onClick={handleVoid} disabled={voiding}>{voiding ? 'Voiding...' : 'Void Invoice'}</Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-danger">Failed to load invoice detail.</p>
          )}
        </div>
      )}
    </div>
  );
}

interface InvoicesTabProps {
  order: AdminOrder;
  token: string;
}

export function InvoicesTab({ order, token }: InvoicesTabProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [invoicedIds, setInvoicedIds] = useState<Set<string>>(new Set());
  const [loadingInvoicedIds, setLoadingInvoicedIds] = useState(false);

  const load = () => {
    setLoading(true);
    adminListInvoices(token, { orderId: order.id })
      .then((r) => setInvoices(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, order.id]);

  const openGenerate = async () => {
    setLoadingInvoicedIds(true);
    try {
      const details = await Promise.all(invoices.map((inv) => adminGetInvoice(token, inv.id)));
      const ids = new Set<string>();
      for (const d of details) {
        for (const item of d.items ?? []) {
          if (item.shipmentItemId) ids.add(item.shipmentItemId);
        }
      }
      setInvoicedIds(ids);
      setShowGenerate(true);
    } finally {
      setLoadingInvoicedIds(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openGenerate} disabled={loadingInvoicedIds}>
          <Plus className="w-3.5 h-3.5" /> {loadingInvoicedIds ? 'Loading...' : 'Generate Invoice'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading invoices...</p>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
          <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">No invoices have been raised for this order yet.</p>
        </div>
      ) : (
        invoices.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} token={token} onChanged={load} />
        ))
      )}

      {showGenerate && (
        <GenerateInvoiceModal
          order={order}
          token={token}
          alreadyInvoicedIds={invoicedIds}
          onClose={() => setShowGenerate(false)}
          onGenerated={() => { setShowGenerate(false); load(); }}
        />
      )}
    </div>
  );
}
