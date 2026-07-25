'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, CheckCircle, XCircle, Download } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { getCompanyQuotation, acceptCompanyQuotation, rejectCompanyQuotation, companyListAddresses, companyOpenQuotationPdf } from '@/lib/api';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Animate } from '@/components/ui/Animate';
import type { Quotation, CompanyAddress } from '@/types';

function apiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const data = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
  return data?.message || data?.error;
}

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const quotationId = params.id;
  const router = useRouter();
  const { token, loading: authLoading, isAuthenticated } = useCompanyAuth();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState('');

  const [actionError, setActionError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push(`/login?redirect=/account/quotations/${quotationId}`);
  }, [authLoading, isAuthenticated, quotationId, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    getCompanyQuotation(token, quotationId)
      .then(setQuotation)
      .catch(() => setError('Quotation not found'))
      .finally(() => setLoading(false));
  }, [token, quotationId]);

  useEffect(() => {
    if (!token) return;
    companyListAddresses(token)
      .then((list) => {
        setAddresses(list);
        if (list.length === 1) setSelectedAddressId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setAddressesLoading(false));
  }, [token]);

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-text-secondary">Loading quotation...</p>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/account/quotations" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Quotations
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Quotation not found'}</p>
      </div>
    );
  }

  const canAct = quotation.status === 'SENT';
  const needsAddressChoice = addresses.length > 1;
  const canSubmitAccept = !needsAddressChoice || !!selectedAddressId;

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setActionError('');
    try {
      const order = await acceptCompanyQuotation(token, quotation.id, needsAddressChoice ? selectedAddressId : undefined);
      router.push(`/account/orders/${order.id}`);
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err) || 'Failed to accept quotation. Please try again.');
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setRejecting(true);
    setActionError('');
    try {
      const updated = await rejectCompanyQuotation(token, quotation.id);
      setQuotation((prev) => (prev ? { ...prev, status: updated.status } : prev));
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err) || 'Failed to reject quotation. Please try again.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/account/quotations" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Quotations
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">{quotation.quoteNumber}</h1>
            <p className="text-sm text-text-muted mt-1">Requested {formatDate(quotation.createdAt)}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => token && companyOpenQuotationPdf(token, quotation.id)}
            >
              <Download className="w-4 h-4 mr-1.5" /> Download PDF
            </Button>
            <Badge className={QUOTATION_STATUS_COLORS[quotation.status]}>
              {QUOTATION_STATUS_LABELS[quotation.status] ?? quotation.status}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-text-secondary mb-6">
          {quotation.status === 'EXPIRED' ? 'Expired' : 'Valid until'} {formatDate(quotation.validUntil)}
        </p>
      </Animate>

      <Animate variant="fadeUp" delay={0.05} duration={0.4}>
        <div className="bg-surface rounded-xl border border-border divide-y divide-border mb-4">
          {quotation.items.map((item) => (
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
      </Animate>

      <Animate variant="fadeUp" delay={0.1} duration={0.4}>
        <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 mb-6">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span>{formatPrice(quotation.subtotal)}</span>
            </div>
            <div className="flex justify-between font-display font-bold text-base pt-2 border-t border-border">
              <span>Total</span>
              <span>{formatPrice(quotation.total)}</span>
            </div>
          </div>
        </div>
      </Animate>

      {canAct && (
        <Animate variant="fadeUp" delay={0.15} duration={0.4}>
          <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Accept or Reject</h2>

            {addressesLoading ? (
              <p className="text-sm text-text-secondary">Loading your saved addresses...</p>
            ) : addresses.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border rounded-lg">
                <MapPin className="w-7 h-7 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-secondary mb-3">You need a saved shipping address before accepting a quote.</p>
                <Link href="/account/addresses"><Button size="sm" type="button">Add an Address</Button></Link>
              </div>
            ) : needsAddressChoice ? (
              <div>
                <p className="text-sm font-medium text-text-secondary mb-2">Ship this order to:</p>
                <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Shipping address">
                  {addresses.map((address) => {
                    const selected = address.id === selectedAddressId;
                    return (
                      <button
                        key={address.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setSelectedAddressId(address.id)}
                        className={cn(
                          'text-left p-3.5 rounded-lg border-2 transition-all cursor-pointer',
                          selected ? 'border-primary bg-primary/5' : 'border-border hover:border-border-hover'
                        )}
                      >
                        <p className="font-semibold text-sm mb-1">{address.label}</p>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          {address.line1}{address.line2 ? `, ${address.line2}` : ''}<br />
                          {address.city}, {address.state} {address.postcode}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                Will ship to <span className="font-medium text-text-primary">{addresses[0].label}</span>.
              </p>
            )}

            {actionError && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{actionError}</p>}

            {addresses.length > 0 && (
              <div className="flex gap-3">
                <Button onClick={handleAccept} disabled={accepting || rejecting || !canSubmitAccept}>
                  <CheckCircle className="w-4 h-4" /> {accepting ? 'Accepting...' : 'Accept Quote'}
                </Button>
                <Button variant="outline" onClick={handleReject} disabled={accepting || rejecting}>
                  <XCircle className="w-4 h-4" /> {rejecting ? 'Rejecting...' : 'Reject'}
                </Button>
              </div>
            )}
          </div>
        </Animate>
      )}
    </div>
  );
}
