'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  adminGetQuotation,
  adminOpenQuotationPdf,
  adminUpdateQuotation,
  adminSendQuotation,
  adminSetQuotationStatus,
  adminGetCompany,
} from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Quotation, CompanyAddress } from '@/types';

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

export default function AdminQuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [validUntil, setValidUntil] = useState('');
  const [prices, setPrices] = useState<Record<string, { quantity: string; unitPrice: string }>>({});
  const [savingPricing, setSavingPricing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const [accepting, setAccepting] = useState(false);
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [shippingAddressId, setShippingAddressId] = useState('');

  const load = () => {
    if (!token) return;
    adminGetQuotation(token, params.id)
      .then((q) => {
        setQuotation(q);
        setValidUntil(toDateInputValue(q.validUntil));
        setPrices(Object.fromEntries(q.items.map((i) => [i.id, { quantity: String(i.quantity), unitPrice: (i.unitPrice / 100).toFixed(2) }])));
      })
      .catch(() => setError('Quotation not found'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, params.id]);

  const editable = quotation?.status === 'DRAFT' || quotation?.status === 'SENT';

  const handleSavePricing = async () => {
    if (!token || !quotation) return;
    setSavingPricing(true);
    setActionError('');
    try {
      await adminUpdateQuotation(token, quotation.id, {
        validUntil: new Date(validUntil).toISOString(),
        items: quotation.items.map((i) => ({
          id: i.id,
          variantId: i.variantId ?? undefined,
          kitId: i.kitId ?? undefined,
          quantity: parseInt(prices[i.id]?.quantity ?? String(i.quantity), 10),
          unitPrice: Math.round(parseFloat(prices[i.id]?.unitPrice ?? '0') * 100),
        })),
      });
      load();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setActionError(message ?? 'Failed to save pricing');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleSend = async () => {
    if (!token || !quotation) return;
    setActionBusy(true);
    setActionError('');
    try {
      await adminSendQuotation(token, quotation.id);
      load();
    } catch {
      setActionError('Failed to send quotation');
    } finally {
      setActionBusy(false);
    }
  };

  const openAccept = async () => {
    if (!token || !quotation) return;
    setAccepting(true);
    setAddressesLoading(true);
    try {
      const company = await adminGetCompany(token, quotation.companyId);
      const addrs = company.addresses ?? [];
      setAddresses(addrs);
      if (addrs.length === 1) setShippingAddressId(addrs[0].id);
    } catch {
      setActionError('Failed to load company addresses');
    } finally {
      setAddressesLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!token || !quotation) return;
    setActionBusy(true);
    setActionError('');
    try {
      await adminSetQuotationStatus(token, quotation.id, { status: 'ACCEPTED', shippingAddressId: shippingAddressId || undefined });
      setAccepting(false);
      load();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setActionError(message ?? 'Failed to accept quotation');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!token || !quotation) return;
    if (!confirm('Reject this quotation?')) return;
    setActionBusy(true);
    setActionError('');
    try {
      await adminSetQuotationStatus(token, quotation.id, { status: 'REJECTED' });
      load();
    } catch {
      setActionError('Failed to reject quotation');
    } finally {
      setActionBusy(false);
    }
  };

  const handleExpire = async () => {
    if (!token || !quotation) return;
    if (!confirm('Mark this quotation as expired?')) return;
    setActionBusy(true);
    setActionError('');
    try {
      await adminSetQuotationStatus(token, quotation.id, { status: 'EXPIRED' });
      load();
    } catch {
      setActionError('Failed to expire quotation');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-text-secondary">Loading quotation...</p>;

  if (error || !quotation) {
    return (
      <div>
        <Link href="/admin/quotations" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Quotations
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Quotation not found'}</p>
      </div>
    );
  }

  const computedTotal = quotation.items.reduce((s, i) => {
    const p = prices[i.id];
    const qty = p ? parseInt(p.quantity, 10) || 0 : i.quantity;
    const unitPrice = p ? Math.round(parseFloat(p.unitPrice || '0') * 100) : i.unitPrice;
    return s + qty * unitPrice;
  }, 0);

  return (
    <div>
      <Link href="/admin/quotations" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Quotations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">{quotation.quoteNumber}</h1>
          <p className="text-sm text-text-muted mt-1">{quotation.company?.name} &middot; {quotation.company?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => token && adminOpenQuotationPdf(token, quotation.id)}
          >
            <Download className="w-4 h-4 mr-1.5" /> Download PDF
          </Button>
          <Badge className={QUOTATION_STATUS_COLORS[quotation.status]}>{QUOTATION_STATUS_LABELS[quotation.status]}</Badge>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 mb-4">
        <h2 className="font-display font-semibold text-lg mb-4">Items &amp; Pricing</h2>
        <div className="space-y-3">
          {quotation.items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium">{itemDisplayName(item)}</p>
              </div>
              {editable ? (
                <>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={prices[item.id]?.quantity ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [item.id]: { ...p[item.id], quantity: e.target.value } }))}
                      className="w-20 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Unit Price (RM)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={prices[item.id]?.unitPrice ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [item.id]: { ...p[item.id], unitPrice: e.target.value } }))}
                      className="w-28 px-2.5 py-1.5 border border-border rounded-lg text-sm bg-surface"
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-secondary">Qty {item.quantity} &times; {formatPrice(item.unitPrice)}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between font-display font-bold text-base pt-4 mt-1 border-t border-border">
          <span>Total</span>
          <span>{editable ? formatPrice(computedTotal) : formatPrice(quotation.total)}</span>
        </div>

        {editable && (
          <div className="mt-4 pt-4 border-t border-border grid sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Valid Until</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
              />
            </div>
            <Button size="sm" onClick={handleSavePricing} disabled={savingPricing}>{savingPricing ? 'Saving...' : 'Save Pricing'}</Button>
          </div>
        )}
      </div>

      {actionError && <p className="text-sm text-danger mb-4">{actionError}</p>}

      <div className="flex flex-wrap gap-2">
        {quotation.status === 'DRAFT' && (
          <Button onClick={handleSend} disabled={actionBusy}>{actionBusy ? 'Sending...' : 'Send Quotation'}</Button>
        )}
        {quotation.status === 'SENT' && !accepting && (
          <>
            <Button onClick={openAccept} disabled={actionBusy}>Accept</Button>
            <Button variant="danger" onClick={handleReject} disabled={actionBusy}>{actionBusy ? 'Working...' : 'Reject'}</Button>
            <Button variant="outline" onClick={handleExpire} disabled={actionBusy}>Mark Expired</Button>
          </>
        )}
      </div>

      {accepting && (
        <div className="bg-surface rounded-xl border border-border p-5 mt-4 max-w-md space-y-3">
          <p className="font-display font-semibold text-sm">Accept Quotation</p>
          {addressesLoading ? (
            <p className="text-sm text-text-secondary">Loading company addresses...</p>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-danger">This company has no saved address yet — it must add one before this quotation can be accepted.</p>
          ) : addresses.length === 1 ? (
            <p className="text-sm text-text-secondary">Shipping to: {addresses[0].label} — {addresses[0].line1}, {addresses[0].city}</p>
          ) : (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Shipping Address</label>
              <select
                value={shippingAddressId}
                onChange={(e) => setShippingAddressId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
              >
                <option value="">Select an address...</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>{a.label} — {a.line1}, {a.city}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAccept} disabled={actionBusy || addresses.length === 0 || (addresses.length > 1 && !shippingAddressId)}>
              {actionBusy ? 'Accepting...' : 'Confirm Accept'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAccepting(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
