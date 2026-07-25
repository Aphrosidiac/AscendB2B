'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Plus, X, Trash2 } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { listCompanyQuotations, requestQuotation, getProducts } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS, QUOTATION_FILTER_OPTIONS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Animate, Stagger } from '@/components/ui/Animate';
import { StatusFilterPills } from '@/components/orders/StatusFilterPills';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { Quotation, QuotationStatus, Product } from '@/types';

type FilterValue = QuotationStatus | '';

function apiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const data = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
  return data?.message || data?.error;
}

let lineIdCounter = 0;
const nextLineId = () => `line-${++lineIdCounter}`;

interface QuoteLine {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
}

export default function QuotationsListPage() {
  const router = useRouter();
  const { token, loading: authLoading, isAuthenticated } = useCompanyAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<FilterValue>('');

  // Request-a-quote builder — no natural entry point exists yet on a
  // product page or cart, so this is a self-contained picker right here
  // (per the task brief: "otherwise add a simple form/button on the
  // quotations list page"). Scoped to plain product variants only — there's
  // no public kit-browsing endpoint yet (admin-only), so kits aren't
  // selectable from this builder.
  const [formOpen, setFormOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/account/quotations');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    listCompanyQuotations(token, status ? { status } : undefined)
      .then((res) => setQuotations(res.data))
      .catch(() => setError('Failed to load quotations'))
      .finally(() => setLoading(false));
  }, [token, status]);

  const openForm = () => {
    setFormError('');
    setFormOpen(true);
    if (products.length === 0) {
      setProductsLoading(true);
      getProducts({ limit: 100 })
        .then((res) => {
          const withVariants = res.data.filter((p) => p.variants.some((v) => v.active));
          setProducts(withVariants);
          if (withVariants.length > 0) {
            const firstVariant = withVariants[0].variants.find((v) => v.active)!;
            setLines([{ id: nextLineId(), productId: withVariants[0].id, variantId: firstVariant.id, quantity: firstVariant.moq || 1 }]);
          }
        })
        .catch(() => setFormError('Failed to load products'))
        .finally(() => setProductsLoading(false));
    }
  };

  const closeForm = () => {
    setFormOpen(false);
    setLines([]);
    setFormError('');
  };

  const addLine = () => {
    if (products.length === 0) return;
    const firstVariant = products[0].variants.find((v) => v.active)!;
    setLines((prev) => [...prev, { id: nextLineId(), productId: products[0].id, variantId: firstVariant.id, quantity: firstVariant.moq || 1 }]);
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const updateLine = (id: string, patch: Partial<QuoteLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleProductChange = (lineId: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const firstVariant = product?.variants.find((v) => v.active);
    updateLine(lineId, { productId, variantId: firstVariant?.id ?? '', quantity: firstVariant?.moq || 1 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const validLines = lines.filter((l) => l.variantId && l.quantity > 0);
    if (validLines.length === 0) {
      setFormError('Add at least one product line.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const created = await requestQuotation(token, {
        items: validLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      setQuotations((prev) => [created, ...prev]);
      closeForm();
    } catch (err: unknown) {
      setFormError(apiErrorMessage(err) || 'Failed to submit quote request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !isAuthenticated) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Account
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-bold">Quotations</h1>
          {!formOpen && (
            <Button size="sm" onClick={openForm}>
              <Plus className="w-4 h-4" /> Request a Quote
            </Button>
          )}
        </div>
      </Animate>

      {formOpen && (
        <Animate variant="fadeUp" duration={0.3} className="mb-6">
          <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg">Request a Quote</h2>
              <button type="button" onClick={closeForm} className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {productsLoading ? (
              <p className="text-sm text-text-secondary">Loading products...</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-text-secondary">No products available to quote right now.</p>
            ) : (
              <div className="space-y-3">
                {lines.map((line) => {
                  const product = products.find((p) => p.id === line.productId);
                  const variantOptions = (product?.variants ?? [])
                    .filter((v) => v.active)
                    .map((v) => ({ value: v.id, label: v.size ? `${v.size} — ${formatPrice(v.price)}` : formatPrice(v.price) }));
                  return (
                    <div key={line.id} className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                      <Select
                        label="Product"
                        id={`product-${line.id}`}
                        value={line.productId}
                        onChange={(e) => handleProductChange(line.id, e.target.value)}
                        options={products.map((p) => ({ value: p.id, label: p.name }))}
                      />
                      <Select
                        label="Size"
                        id={`variant-${line.id}`}
                        value={line.variantId}
                        onChange={(e) => updateLine(line.id, { variantId: e.target.value })}
                        options={variantOptions}
                      />
                      <Input
                        label="Qty"
                        id={`qty-${line.id}`}
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-20"
                      />
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length === 1}
                        className="p-2 mb-1 text-text-muted hover:text-danger transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-3.5 h-3.5" /> Add Product
                </Button>
              </div>
            )}

            {formError && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{formError}</p>}

            <div className="flex gap-3 pt-2 border-t border-border">
              <Button type="submit" disabled={submitting || products.length === 0}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
            </div>
          </form>
        </Animate>
      )}

      <Animate variant="fadeUp" delay={0.05} duration={0.4} className="mb-6">
        <StatusFilterPills
          options={QUOTATION_FILTER_OPTIONS}
          value={status}
          onChange={(v) => setStatus(v as FilterValue)}
        />
      </Animate>

      {error && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4">{error}</p>}

      <FadeSwap swapKey={loading ? 'loading' : `${status}:${quotations.length}`}>
        {loading ? (
          <p className="text-sm text-text-secondary">Loading quotations...</p>
        ) : quotations.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
            <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary">
              {status ? 'No quotations match this filter.' : "You haven't requested any quotations yet."}
            </p>
          </div>
        ) : (
          <Stagger className="space-y-3" stagger={0.06}>
            {quotations.map((quotation) => (
              <Link
                key={quotation.id}
                href={`/account/quotations/${quotation.id}`}
                className="block bg-surface rounded-xl border border-border p-4 sm:p-5 hover:border-border-hover hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-display font-bold">{quotation.quoteNumber}</p>
                    <p className="text-xs text-text-muted">Requested {formatDate(quotation.createdAt)}</p>
                  </div>
                  <Badge className={QUOTATION_STATUS_COLORS[quotation.status]}>
                    {QUOTATION_STATUS_LABELS[quotation.status] ?? quotation.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <p className="text-sm text-text-secondary">
                    {quotation.items.length} item{quotation.items.length === 1 ? '' : 's'} &middot; Valid until {formatDate(quotation.validUntil)}
                  </p>
                  <p className="font-display font-semibold">{formatPrice(quotation.total)}</p>
                </div>
              </Link>
            ))}
          </Stagger>
        )}
      </FadeSwap>
    </div>
  );
}
