'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Layers, X } from 'lucide-react';
import { adminListUnbilled, adminGenerateInvoice } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { CREDIT_TERMS_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { errorMessage } from './utils';
import type { UnbilledCompanyRow, UnbilledItem } from '@/types';

function itemDisplayName(orderItem: UnbilledItem['orderItem']): string {
  if (orderItem.variant) return `${orderItem.variant.product.name}${orderItem.variant.size ? ` ${orderItem.variant.size}` : ''}`;
  if (orderItem.kit) return orderItem.kit.name;
  return 'Item';
}

interface GenerateInvoiceModalProps {
  token: string;
  onClose: () => void;
  onGenerated: (invoiceId: string) => void;
}

// Two-step consolidated billing flow, and the whole reason this page exists.
// Invoice belongs to Company, not Order (see docs/erd-b2b.md's
// shipment/invoice decoupling), so one invoice can cover shipments spanning
// several orders — step 1 picks the company, step 2 selects unbilled shipment
// items across ALL of that company's orders. The per-order Invoices tab can
// only ever see one order's items, which is exactly the gap this closes.
export function GenerateInvoiceModal({ token, onClose, onGenerated }: GenerateInvoiceModalProps) {
  const [companies, setCompanies] = useState<UnbilledCompanyRow[] | null>(null);
  const [picked, setPicked] = useState<UnbilledCompanyRow | null>(null);
  const [items, setItems] = useState<UnbilledItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminListUnbilled(token)
      .then((r) => setCompanies(r.companies ?? []))
      .catch((err) => { setCompanies([]); setError(errorMessage(err, 'Failed to load unbilled items')); });
  }, [token]);

  const pickCompany = (row: UnbilledCompanyRow) => {
    setPicked(row);
    setItems(null);
    setError('');
    adminListUnbilled(token, row.company.id)
      .then((r) => {
        const rows = r.items ?? [];
        setItems(rows);
        // Default everything selected — the common case is "bill everything
        // outstanding for this company this month".
        setSelected(new Set(rows.map((i) => i.id)));
      })
      .catch((err) => { setItems([]); setError(errorMessage(err, 'Failed to load unbilled items')); });
  };

  // Grouped by order so it's visually obvious a single invoice spans several
  // orders — that's the capability the data model was designed for.
  const groups = useMemo(() => {
    const byOrder = new Map<string, { orderId: string; orderNumber: string; rows: UnbilledItem[] }>();
    for (const item of items ?? []) {
      const order = item.shipment.order;
      const entry = byOrder.get(order.id) ?? { orderId: order.id, orderNumber: order.orderNumber, rows: [] };
      entry.rows.push(item);
      byOrder.set(order.id, entry);
    }
    return [...byOrder.values()];
  }, [items]);

  const selectedRows = (items ?? []).filter((i) => selected.has(i.id));
  const selectedTotal = selectedRows.reduce((s, i) => s + i.amount, 0);
  const selectedOrderCount = new Set(selectedRows.map((i) => i.shipment.order.id)).size;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (rows: UnbilledItem[]) => {
    const allOn = rows.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (allOn) next.delete(r.id); else next.add(r.id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const invoice = await adminGenerateInvoice(token, { shipmentItemIds: [...selected] });
      onGenerated(invoice.id);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to generate invoice'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl border border-border w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-border">
          <div>
            <h3 className="font-display font-semibold text-lg">
              {picked ? `Bill ${picked.company.name}` : 'Bill a Company'}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {picked
                ? 'Select the shipped items to consolidate onto one invoice.'
                : 'Companies with shipped items that have not been invoiced yet.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-elevated cursor-pointer" aria-label="Close">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {/* Step 1 — who is owed an invoice. */}
          {!picked && (
            companies === null ? (
              <div className="animate-pulse space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-surface-elevated rounded-lg" />)}
              </div>
            ) : companies.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-10 h-10 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">Nothing is waiting to be billed.</p>
                <p className="text-sm text-text-muted mt-1">Every shipped item has already been invoiced.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {companies.map((row) => (
                  <button
                    key={row.company.id}
                    type="button"
                    onClick={() => pickCompany(row)}
                    className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 rounded-lg border border-border hover:border-border-hover hover:bg-surface-elevated transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{row.company.name}</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {row.orderCount} order{row.orderCount !== 1 ? 's' : ''} &middot; {row.itemCount} item{row.itemCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className={row.company.creditTerms === 'PREPAID' ? 'bg-gray-100 text-gray-800' : 'bg-green-100 text-green-800'}>
                        {CREDIT_TERMS_LABELS[row.company.creditTerms]}
                      </Badge>
                      <span className="font-display font-semibold text-sm">{formatPrice(row.amount)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* Step 2 — every unbilled shipment item for that company, across
              all of their orders. */}
          {picked && (
            items === null ? (
              <div className="animate-pulse space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-surface-elevated rounded-lg" />)}
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-text-secondary py-8 text-center">
                Nothing left to bill for {picked.company.name}.
              </p>
            ) : (
              <div className="space-y-4">
                {groups.length > 1 && (
                  <div className="flex items-start gap-2 rounded-lg bg-surface-elevated px-3 py-2.5">
                    <Layers className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                    <p className="text-xs text-text-secondary">
                      These items span <strong className="font-semibold text-text-primary">{groups.length} orders</strong>.
                      They will be consolidated onto a single invoice, due on {CREDIT_TERMS_LABELS[picked.company.creditTerms]} terms.
                    </p>
                  </div>
                )}

                {groups.map((group) => {
                  const allOn = group.rows.every((r) => selected.has(r.id));
                  const groupTotal = group.rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.amount, 0);
                  return (
                    <div key={group.orderId} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-elevated">
                        <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allOn}
                            onChange={() => toggleGroup(group.rows)}
                            className="cursor-pointer shrink-0"
                          />
                          <span className="font-display font-semibold text-sm truncate">{group.orderNumber}</span>
                          <span className="text-xs text-text-muted shrink-0">
                            {group.rows.length} item{group.rows.length !== 1 ? 's' : ''}
                          </span>
                        </label>
                        <span className="text-sm font-semibold shrink-0 tabular-nums">{formatPrice(groupTotal)}</span>
                      </div>
                      <div className="divide-y divide-border">
                        {group.rows.map((row) => (
                          <label
                            key={row.id}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-elevated/60 cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={() => toggle(row.id)}
                                className="cursor-pointer shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{itemDisplayName(row.orderItem)}</p>
                                <p className="text-xs text-text-muted">
                                  {row.shipment.shipmentNumber} &middot; Batch {row.batch.batchNumber} &middot; Qty {row.quantity}
                                  {row.shipment.shippedAt
                                    ? ` · Shipped ${formatDate(row.shipment.shippedAt)}`
                                    : ' · Not yet shipped'}
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-semibold shrink-0 tabular-nums">{formatPrice(row.amount)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        <div className="border-t border-border p-5 sm:p-6 space-y-3">
          {error && <p className="text-sm text-danger">{error}</p>}

          {picked && (items?.length ?? 0) > 0 && (
            <div className="flex items-center justify-between font-display font-bold">
              <span className="text-sm">
                Invoice Total
                <span className="block text-xs font-body font-normal text-text-muted">
                  {selected.size} item{selected.size !== 1 ? 's' : ''} from {selectedOrderCount} order{selectedOrderCount !== 1 ? 's' : ''}
                </span>
              </span>
              <span className="tabular-nums">{formatPrice(selectedTotal)}</span>
            </div>
          )}

          <div className="flex gap-2">
            {picked ? (
              <>
                <Button onClick={handleSubmit} disabled={selected.size === 0 || submitting}>
                  {submitting ? 'Generating...' : `Generate Invoice (${selected.size})`}
                </Button>
                <Button variant="ghost" onClick={() => { setPicked(null); setItems(null); setSelected(new Set()); setError(''); }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
