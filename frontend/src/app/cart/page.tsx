'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, ShoppingCart, TrendingDown, FileText, TriangleAlert } from 'lucide-react';
import { useCart, cartLineKey } from '@/lib/cart';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { requestQuotation } from '@/lib/api';
import { formatPrice, getTieredPrice, getNextTier } from '@/lib/utils';
import { CREDIT_TERMS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import { Animate, Stagger } from '@/components/ui/Animate';

function apiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const data = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
  return data?.message || data?.error;
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, total, itemCount } = useCart();
  const { token, company, isAuthenticated } = useCompanyAuth();
  const router = useRouter();
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const profileIncomplete = Boolean(company && !company.profileComplete);

  // Turns the cart straight into a quote request instead of making a buyer
  // re-enter every line in the /account/quotations builder. Same XOR payload
  // shape the order endpoint takes.
  const handleRequestQuote = async () => {
    if (!token || items.length === 0) return;
    setQuoting(true);
    setQuoteError('');
    try {
      const quote = await requestQuotation(token, {
        items: items.map((i) =>
          i.kitId ? { kitId: i.kitId, quantity: i.quantity } : { variantId: i.variantId, quantity: i.quantity }
        ),
      });
      router.push(`/account/quotations/${quote.id}`);
    } catch (err: unknown) {
      setQuoteError(apiErrorMessage(err) || 'Could not create the quote request. Please try again.');
      setQuoting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <Animate variant="scale" duration={0.5}>
          <ShoppingCart className="w-16 h-16 text-text-muted mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold mb-2">Nothing in your order yet</h1>
          <p className="text-text-secondary mb-6">
            Add SKUs from the price list, or a pre-assembled kit.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/products"><Button>View the price list</Button></Link>
            <Link href="/kits"><Button variant="outline">Browse kits</Button></Link>
          </div>
        </Animate>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Animate variant="fadeUp" duration={0.5}>
        <h1 className="font-display text-3xl font-bold mb-1">Your order</h1>
        <p className="text-text-secondary mb-8">
          {itemCount} {itemCount === 1 ? 'unit' : 'units'} across {items.length}{' '}
          {items.length === 1 ? 'line' : 'lines'}. Unit prices reflect quantity breaks and are
          re-confirmed on the order.
        </p>
      </Animate>

      <div className="grid lg:grid-cols-3 gap-8">
        <Stagger className="lg:col-span-2 space-y-3" stagger={0.06}>
          {items.map((item) => {
            const moq = item.moq && item.moq > 1 ? item.moq : 1;
            const unitPrice = getTieredPrice(item.priceTiers, item.quantity, item.price);
            const atMoq = item.quantity <= moq;
            const lineKey = cartLineKey(item);
            const nextTier = getNextTier(item.priceTiers, item.quantity, item.price);
            return (
              <div key={lineKey} className="bg-surface rounded-xl border border-border p-4">
                {/* No thumbnail — the storefront is picture-free, and a code
                    plus a compound name identifies a SKU better than a photo of
                    a vial that looks like every other vial. */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-base">
                      {item.kitId ? item.name : item.code}
                    </h2>
                    <p className="text-sm text-text-secondary">
                      {item.kitId ? `Kit · ${item.kitContents?.length ?? 0} products` : item.name}
                    </p>
                    <p className="text-sm text-text-secondary mt-0.5 tabular-nums">
                      {formatPrice(unitPrice)}/{item.kitId ? 'kit' : 'unit'}
                      {moq > 1 && <span className="text-text-muted"> · MOQ {moq}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(lineKey)}
                    className="p-2 text-text-muted hover:text-danger transition-colors cursor-pointer shrink-0"
                    aria-label={`Remove ${item.code}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {item.kitId && item.kitContents && item.kitContents.length > 0 && (
                  <ul className="mt-3 pt-3 border-t border-border space-y-1">
                    {item.kitContents.map((content, idx) => (
                      <li key={idx} className="flex justify-between text-xs text-text-secondary">
                        <span className="truncate pr-2">
                          {content.name}
                          {content.size ? ` ${content.size}` : ''}
                        </span>
                        <span className="shrink-0 text-text-muted tabular-nums">
                          &times;{content.quantity * item.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* The thing a wholesale cart exists to say. One tap moves the
                    line onto the cheaper tier. */}
                {nextTier && (
                  <button
                    type="button"
                    onClick={() => updateQuantity(lineKey, nextTier.minQty)}
                    className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-left hover:border-border-hover transition-colors cursor-pointer"
                  >
                    <TrendingDown className="w-4 h-4 text-text-muted shrink-0" />
                    <span className="text-xs text-text-secondary">
                      Add {nextTier.addMore} more to reach{' '}
                      <span className="font-medium text-text-primary tabular-nums">
                        {formatPrice(nextTier.unitPrice)}/unit
                      </span>{' '}
                      &mdash; saves {formatPrice(nextTier.savingPerUnit)} per unit at {nextTier.minQty}+
                    </span>
                  </button>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <div className="flex items-center border border-border rounded-lg">
                    <button
                      onClick={() => updateQuantity(lineKey, Math.max(moq, item.quantity - 1))}
                      disabled={atMoq}
                      className="px-3 py-1.5 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="px-4 py-1.5 text-sm font-medium tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(lineKey, item.quantity + 1)}
                      className="px-3 py-1.5 text-text-secondary hover:text-text-primary cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <p className="font-display font-bold text-lg tabular-nums">
                    {formatPrice(unitPrice * item.quantity)}
                  </p>
                </div>
              </div>
            );
          })}
        </Stagger>

        <Animate variant="fadeUp" delay={0.2}>
          <div className="h-fit lg:sticky lg:top-24 space-y-4">
            <div className="bg-surface rounded-xl border border-border p-5">
              <h2 className="font-display font-semibold text-lg mb-4">Summary</h2>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Lines</dt>
                  <dd className="tabular-nums">{items.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Units</dt>
                  <dd className="tabular-nums">{itemCount}</dd>
                </div>
                {company && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Payment terms</dt>
                    <dd>{CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms}</dd>
                  </div>
                )}
              </dl>

              <div className="border-t border-border mt-4 pt-4">
                <div className="flex justify-between font-display font-bold text-lg">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatPrice(total)}</span>
                </div>
                <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
                  Excludes delivery. Final pricing is recomputed server-side when the order is
                  placed, so this is an estimate.
                </p>
              </div>

              {/* A logged-out buyer would otherwise press Checkout and get
                  bounced to /login with no explanation — trade pricing and
                  ordering are account-gated here. */}
              <div className="mt-5 space-y-2">
                {isAuthenticated ? (
                  <Link href="/checkout" className="block">
                    <Button className="w-full" size="lg" disabled={profileIncomplete}>
                      Proceed to checkout
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link href="/login?redirect=/checkout" className="block">
                      <Button className="w-full" size="lg">Sign in to check out</Button>
                    </Link>
                    <Link href="/signup" className="block">
                      <Button className="w-full" variant="outline">Apply for a trade account</Button>
                    </Link>
                  </>
                )}

                {isAuthenticated && !profileIncomplete && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleRequestQuote}
                    disabled={quoting}
                  >
                    <FileText className="w-4 h-4" />
                    {quoting ? 'Creating request...' : 'Request a quote instead'}
                  </Button>
                )}
              </div>

              {quoteError && <p className="text-sm text-danger mt-3">{quoteError}</p>}

              {isAuthenticated && !profileIncomplete && (
                <p className="text-xs text-text-muted mt-3 leading-relaxed">
                  Need pricing beyond the published tiers? A quote sends these lines to us to price
                  directly, without placing the order.
                </p>
              )}
            </div>

            {profileIncomplete && (
              <div className="rounded-xl border border-orange-300 bg-orange-50/60 p-4">
                <p className="flex items-center gap-2 font-display font-semibold text-sm">
                  <TriangleAlert className="w-4 h-4 text-orange-600 shrink-0" />
                  Business profile incomplete
                </p>
                <p className="text-sm text-text-secondary mt-1">
                  Your company name, contact name and phone number go on the invoice. Add them
                  before ordering or requesting a quote.
                </p>
                <Link
                  href="/account"
                  className="mt-2 inline-flex text-sm font-medium text-text-primary hover:underline"
                >
                  Complete business profile &rarr;
                </Link>
              </div>
            )}
          </div>
        </Animate>
      </div>
    </div>
  );
}
