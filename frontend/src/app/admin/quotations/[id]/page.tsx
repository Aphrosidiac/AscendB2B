'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Building2, Package, ArrowRight, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  adminGetQuotation,
  adminOpenQuotationPdf,
  adminUpdateQuotation,
  adminSendQuotation,
  adminSetQuotationStatus,
  adminGetCompany,
  adminGetOrders,
} from '@/lib/api';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS, CREDIT_TERMS_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getQuoteValidity, QuotationStepper, ValidityCallout } from '@/components/quotations/QuotationProgress';
import type { Quotation, CompanyAddress, AdminCompany, AdminOrder } from '@/types';

// adminGetQuotation's company select carries contactName/phone as well (see
// requireQuotation in backend/src/modules/admin/admin-quotations.controller.ts),
// but the shared `Quotation` type only declares id/name/email. Narrowed
// locally rather than widening the shared contract from this page.
type AdminQuotationCompany = { id: string; name: string; email: string; contactName?: string; phone?: string };

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const message = err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
    : undefined;
  return message ?? fallback;
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
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [shippingAddressId, setShippingAddressId] = useState('');

  const [convertedOrder, setConvertedOrder] = useState<AdminOrder | null>(null);

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

  // The quotation payload carries no credit terms and no addresses, both of
  // which this page needs (terms drive the invoice due date the buyer will
  // get; addresses are required to accept on their behalf), so the company is
  // loaded once up front instead of only when the accept panel opens.
  const companyId = quotation?.companyId;
  useEffect(() => {
    if (!token || !companyId) return;
    setCompanyLoading(true);
    adminGetCompany(token, companyId)
      .then((c) => {
        setCompany(c);
        const addrs = c.addresses ?? [];
        if (addrs.length === 1) setShippingAddressId(addrs[0].id);
      })
      .catch(() => {})
      .finally(() => setCompanyLoading(false));
  }, [token, companyId]);

  // Order lists carry no quotationId filter, so the converted order is found
  // by scanning recent orders for the one this quote created.
  useEffect(() => {
    if (!token || quotation?.status !== 'ACCEPTED') return;
    adminGetOrders(token, { limit: '100' })
      .then((res) => setConvertedOrder(res.data.find((o) => o.quotationId === quotation.id) ?? null))
      .catch(() => {});
  }, [token, quotation?.status, quotation?.id]);

  const editable = quotation?.status === 'DRAFT' || quotation?.status === 'SENT';
  const addresses: CompanyAddress[] = company?.addresses ?? [];

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
      setActionError(apiErrorMessage(err, 'Failed to save pricing'));
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
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Failed to send quotation'));
    } finally {
      setActionBusy(false);
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
      setActionError(apiErrorMessage(err, 'Failed to accept quotation'));
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
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Failed to reject quotation'));
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
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Failed to expire quotation'));
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

  const quoteCompany = quotation.company as AdminQuotationCompany | undefined;
  const validity = getQuoteValidity(quotation.status, quotation.validUntil);

  const computedTotal = quotation.items.reduce((s, i) => {
    const p = prices[i.id];
    const qty = p ? parseInt(p.quantity, 10) || 0 : i.quantity;
    const unitPrice = p ? Math.round(parseFloat(p.unitPrice || '0') * 100) : i.unitPrice;
    return s + qty * unitPrice;
  }, 0);

  const unpricedLines = quotation.items.filter((i) => {
    const p = prices[i.id];
    const unitPrice = p ? Math.round(parseFloat(p.unitPrice || '0') * 100) : i.unitPrice;
    return unitPrice <= 0;
  }).length;

  return (
    <div>
      <Link href="/admin/quotations" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Quotations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">{quotation.quoteNumber}</h1>
          <p className="text-sm text-text-muted mt-1">
            Requested {formatDate(quotation.createdAt)}
            {quotation.createdBy ? ` · by ${quotation.createdBy}` : ''}
          </p>
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

      <ValidityCallout
        validity={validity}
        detail={
          quotation.status === 'DRAFT'
            ? `Not sent to ${quoteCompany?.name ?? 'the customer'} yet. Set pricing and a validity date, then send.`
            : undefined
        }
        className="mb-6"
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-surface rounded-xl border border-border p-5 sm:p-6 flex items-center">
          <QuotationStepper status={quotation.status} />
        </div>

        <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-text-muted" />
            <h2 className="font-display font-semibold text-base">Customer</h2>
          </div>
          {quoteCompany ? (
            <Link href={`/admin/companies/${quoteCompany.id}`} className="text-sm font-medium hover:underline">
              {quoteCompany.name}
            </Link>
          ) : (
            <p className="text-sm font-medium">—</p>
          )}
          <p className="text-sm text-text-secondary mt-0.5">
            {quoteCompany?.contactName ? `${quoteCompany.contactName} · ` : ''}
            {quoteCompany?.email ?? '—'}
          </p>
          {quoteCompany?.phone && <p className="text-sm text-text-secondary">{quoteCompany.phone}</p>}
          <p className="text-xs text-text-muted mt-2">
            Credit Terms:{' '}
            {companyLoading
              ? '…'
              : company
                ? CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms
                : '—'}
          </p>
          <p className="text-xs text-text-muted">
            {companyLoading ? '' : `${addresses.length} saved address${addresses.length === 1 ? '' : 'es'}`}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Quoted Total</p>
          <p className="font-display text-xl font-bold tabular-nums">
            {editable ? formatPrice(computedTotal) : formatPrice(quotation.total)}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Line Items</p>
          <p className="font-display text-xl font-bold tabular-nums">{quotation.items.length}</p>
          {unpricedLines > 0 && (
            <p className="text-xs text-yellow-800 font-medium mt-1">{unpricedLines} unpriced</p>
          )}
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Valid Until</p>
          <p className={cn('font-display text-xl font-bold', validity.expired && 'text-danger')}>
            {formatDate(quotation.validUntil).split(',')[0]}
          </p>
          {!validity.settled && (
            <p className={cn('text-xs mt-1', validity.expired ? 'text-danger font-medium' : 'text-text-muted')}>
              {validity.headline}
            </p>
          )}
        </div>
      </div>

      {convertedOrder && (
        <Link
          href={`/admin/orders/${convertedOrder.id}`}
          className="flex items-center justify-between gap-3 bg-surface rounded-xl border border-border p-4 mb-6 hover:border-border-hover transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Package className="w-4 h-4 text-text-muted shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Converted to order {convertedOrder.orderNumber}</p>
              <p className="text-xs text-text-muted">Placed {formatDate(convertedOrder.createdAt)} · {formatPrice(convertedOrder.total)}</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
        </Link>
      )}

      <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 mb-4">
        <h2 className="font-display font-semibold text-lg mb-4">Items &amp; Pricing</h2>
        <div className="space-y-3">
          {quotation.items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium">{itemDisplayName(item)}</p>
                {item.variant?.code && <p className="text-xs text-text-muted">{item.variant.code}</p>}
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
                  <div className="w-24 text-right">
                    <label className="block text-xs text-text-muted mb-1">Line</label>
                    <p className="text-sm font-medium tabular-nums py-1.5">
                      {formatPrice(
                        (parseInt(prices[item.id]?.quantity ?? '0', 10) || 0) *
                          Math.round(parseFloat(prices[item.id]?.unitPrice || '0') * 100)
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-text-secondary">Qty {item.quantity} &times; {formatPrice(item.unitPrice)}</p>
                  <p className="w-24 text-right text-sm font-medium tabular-nums">{formatPrice(item.unitPrice * item.quantity)}</p>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between font-display font-bold text-base pt-4 mt-1 border-t border-border">
          <span>Total</span>
          <span className="tabular-nums">{editable ? formatPrice(computedTotal) : formatPrice(quotation.total)}</span>
        </div>

        {editable && (
          <div className="mt-4 pt-4 border-t border-border grid sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Valid Until — how long these prices are held
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
              />
            </div>
            <div>
              <Button size="sm" onClick={handleSavePricing} disabled={savingPricing}>{savingPricing ? 'Saving...' : 'Save Pricing'}</Button>
            </div>
          </div>
        )}
      </div>

      {actionError && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4">{actionError}</p>}

      <div className="flex flex-wrap gap-2">
        {quotation.status === 'DRAFT' && (
          <Button onClick={handleSend} disabled={actionBusy}>
            <Send className="w-4 h-4" /> {actionBusy ? 'Sending...' : 'Send Quotation'}
          </Button>
        )}
        {quotation.status === 'SENT' && !accepting && (
          <>
            <Button onClick={() => setAccepting(true)} disabled={actionBusy}>Accept</Button>
            <Button variant="danger" onClick={handleReject} disabled={actionBusy}>{actionBusy ? 'Working...' : 'Reject'}</Button>
            <Button variant="outline" onClick={handleExpire} disabled={actionBusy}>Mark Expired</Button>
          </>
        )}
      </div>

      {accepting && (
        <div className="bg-surface rounded-xl border border-border p-5 mt-4 max-w-md space-y-3">
          <p className="font-display font-semibold text-sm">Accept Quotation</p>
          {validity.expired && (
            <p className="text-sm text-danger">
              This quote is past its validity date — the API will reject the acceptance. Extend Valid Until first.
            </p>
          )}
          {companyLoading ? (
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
