'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, Wallet, ArrowLeft, CheckCircle, ShieldCheck, Truck, Lock, X, Tag, MapPin, Plus } from 'lucide-react';
import { useCart, cartLineKey } from '@/lib/cart';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { createCompanyOrder, getSettings, validateDiscount, companyListAddresses } from '@/lib/api';
import { formatPrice, getTieredPrice, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Animate } from '@/components/ui/Animate';
import type { CompanyAddress } from '@/types';

const CREDIT_TERMS_LABELS: Record<string, string> = {
  PREPAID: 'Prepaid',
  NET15: 'Net 15',
  NET30: 'Net 30',
  NET60: 'Net 60',
};

const makeIdempotencyKey = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const redirectTo = (url: string) => {
  window.location.href = url;
};

// The API reports errors as { message } for app errors and
// { error, details: [{ path, message }] } for validation errors — surface
// the most specific one instead of a generic fallback.
function apiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const data = (err as {
    response?: { data?: { message?: string; error?: string; details?: { path?: string; message?: string }[] } };
  }).response?.data;
  const detail = data?.details?.[0];
  if (detail?.message) return detail.path ? `${detail.path}: ${detail.message}` : detail.message;
  return data?.message || data?.error;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, total, clearCart, hydrated } = useCart();
  const { token, company, loading: authLoading, isAuthenticated } = useCompanyAuth();

  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [shippingAddressId, setShippingAddressId] = useState('');
  const [notes, setNotes] = useState('');
  // Credit-terms companies default to billing later; a PREPAID company (no
  // credit extended) defaults to paying now instead — either way it's a
  // toggle, never a hard requirement (payNow is optional on the order API).
  const [payNow, setPayNow] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ orderNumber: string; billedOnCredit: boolean } | null>(null);
  const [error, setError] = useState('');

  const [shippingFee, setShippingFee] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
  } | null>(null);

  const submitting = useRef(false);
  // Stable per-attempt key so a network retry of a committed order doesn't
  // create a duplicate. Reset after a successful submit.
  const idempotencyKeyRef = useRef<string | null>(null);
  // Guards the payNow default so it's applied exactly once, the first time
  // `company` loads — without this, a later `company` reference change
  // (e.g. another page calling useCompanyAuth().refresh()) would silently
  // stomp over a payment method the customer already picked by hand.
  const payNowDefaultApplied = useRef(false);

  useEffect(() => {
    getSettings().then((s) => setShippingFee(s.shipping_fee || '')).catch(() => {});
  }, []);

  useEffect(() => {
    if (company && !payNowDefaultApplied.current) {
      payNowDefaultApplied.current = true;
      setPayNow(company.creditTerms === 'PREPAID');
    }
  }, [company]);

  useEffect(() => {
    if (!token) return;
    companyListAddresses(token)
      .then((list) => {
        setAddresses(list);
        if (list.length > 0) setShippingAddressId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setAddressesLoading(false));
  }, [token]);

  // Checkout requires a signed-in company — redirect once auth state is
  // resolved (don't bounce mid-hydration, same reasoning as the cart-empty
  // redirect below).
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/checkout');
  }, [authLoading, isAuthenticated, router]);

  // The cart loads from localStorage in an effect, so on a hard refresh the
  // first render always sees an empty cart — redirecting during render would
  // bounce every direct /checkout visit back to /cart. Wait for hydration,
  // and redirect from an effect (not mid-render) per React's rules.
  const shouldRedirectCart = hydrated && items.length === 0 && !success && !loading;
  useEffect(() => {
    if (shouldRedirectCart) router.push('/cart');
  }, [shouldRedirectCart, router]);

  if (authLoading || !isAuthenticated || !hydrated || shouldRedirectCart) return null;

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !token) return;
    setDiscountLoading(true);
    setDiscountError('');
    try {
      const result = await validateDiscount(token, discountCode.trim(), total);
      setAppliedDiscount(result);
      setDiscountCode('');
    } catch (err: unknown) {
      setDiscountError(apiErrorMessage(err) || 'Invalid discount code');
    } finally {
      setDiscountLoading(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountError('');
  };

  const discountAmount = appliedDiscount?.discountAmount ?? 0;
  const shippingParsed = parseFloat(shippingFee);
  const shippingInSen = Number.isFinite(shippingParsed) && shippingParsed > 0 ? Math.round(shippingParsed * 100) : 0;
  const orderTotal = Math.max(0, total + shippingInSen - discountAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || !token) return;
    if (!shippingAddressId) {
      setError('Please select a shipping address.');
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError('');

    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = makeIdempotencyKey();
      }
      const result = await createCompanyOrder(token, {
        shippingAddressId,
        notes: notes.trim() || undefined,
        payNow,
        // variantId XOR kitId — the backend rejects an item carrying both, so
        // send only the one this line actually has.
        items: items.map((i) =>
          i.kitId
            ? { kitId: i.kitId, quantity: i.quantity }
            : { variantId: i.variantId, quantity: i.quantity }
        ),
        idempotencyKey: idempotencyKeyRef.current,
        ...(appliedDiscount ? { discountCode: appliedDiscount.code } : {}),
      });

      idempotencyKeyRef.current = null; // success — next order gets a fresh key

      if (payNow && result.paymentUrl) {
        clearCart();
        redirectTo(result.paymentUrl);
        return;
      }

      clearCart();
      setSuccess({ orderNumber: result.order.orderNumber, billedOnCredit: !payNow });
    } catch (err: unknown) {
      setError(apiErrorMessage(err) || 'Failed to place order. Please try again.');
      setLoading(false);
      submitting.current = false;
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <Animate variant="scale" duration={0.5}>
          <CheckCircle className="w-14 h-14 text-success mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold mb-2">Order Placed!</h1>
          <p className="text-text-secondary mb-1">Your order number is:</p>
          <p className="font-display text-xl font-bold mb-6">{success.orderNumber}</p>

          {success.billedOnCredit && (
            <div className="bg-surface-elevated border border-border rounded-xl p-5 mb-6 text-left">
              <p className="text-sm text-text-secondary leading-relaxed">
                This order will be billed per your credit terms once it ships — you&apos;ll receive an invoice, no payment is needed now.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/products"><Button variant="outline" className="w-full sm:w-auto">Continue Shopping</Button></Link>
            <Link href="/account/orders"><Button variant="secondary" className="w-full sm:w-auto">View Orders</Button></Link>
          </div>
        </Animate>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/cart" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Cart
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <h1 className="font-display text-3xl font-bold mb-8">Checkout</h1>
      </Animate>

      <form onSubmit={handleSubmit} noValidate className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-5">
          {/* Shipping Address picker — reuses the company's saved
              CompanyAddress list from Part 2 instead of a typed-per-order
              address form. */}
          <Animate variant="fadeUp" delay={0.05}>
            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">1</div>
                  <h2 className="font-display font-semibold text-lg">Shipping Address</h2>
                </div>
                <Link href="/account/addresses" className="text-sm text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add New
                </Link>
              </div>

              {/* The server refuses to create an order while the business
                  profile is incomplete (assertProfileComplete) — surfaced here
                  so it isn't discovered only after pressing Place Order. */}
              {company && !company.profileComplete && (
                <div className="mb-5 rounded-lg border border-orange-300 bg-orange-50/60 px-4 py-3.5">
                  <p className="font-display font-semibold text-sm">Business profile incomplete</p>
                  <p className="text-sm text-text-secondary mt-0.5">
                    Your company name, contact name and phone number go on the invoice for this
                    order. Add them to continue.
                  </p>
                  <Link
                    href="/account"
                    className="mt-2 inline-flex text-sm font-medium text-text-primary hover:underline"
                  >
                    Complete business profile &rarr;
                  </Link>
                </div>
              )}

              {addressesLoading ? (
                <p className="text-sm text-text-secondary">Loading addresses...</p>
              ) : addresses.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-lg">
                  <MapPin className="w-8 h-8 text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-secondary mb-3">You don&apos;t have a saved address yet.</p>
                  <Link href="/account/addresses"><Button size="sm" type="button">Add an Address</Button></Link>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Shipping address">
                  {addresses.map((address) => {
                    const selected = address.id === shippingAddressId;
                    return (
                      <button
                        key={address.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setShippingAddressId(address.id)}
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
              )}
            </div>
          </Animate>

          {/* Payment — conditional/optional. Orders can go out on credit
              terms (no payment now) or with an immediate pay-now, per
              orders.controller.ts's `payNow` flag; never a hard requirement. */}
          <Animate variant="fadeUp" delay={0.1}>
            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">2</div>
                <h2 className="font-display font-semibold text-lg">Payment</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPayNow(false)}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all cursor-pointer',
                    !payNow ? 'border-primary bg-primary/5' : 'border-border hover:border-border-hover'
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', !payNow ? 'bg-primary/10' : 'bg-surface-elevated')}>
                      <Wallet className={cn('w-5 h-5', !payNow ? 'text-primary' : 'text-text-muted')} />
                    </div>
                    <p className="font-semibold">Bill Later</p>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Invoiced on your {company ? CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms : 'credit'} terms once this order ships.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPayNow(true)}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all cursor-pointer',
                    payNow ? 'border-primary bg-primary/5' : 'border-border hover:border-border-hover'
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', payNow ? 'bg-primary/10' : 'bg-surface-elevated')}>
                      <CreditCard className={cn('w-5 h-5', payNow ? 'text-primary' : 'text-text-muted')} />
                    </div>
                    <p className="font-semibold">Pay Now</p>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">FPX / Credit Card, paid online immediately.</p>
                </button>
              </div>
            </div>
          </Animate>

          {/* Notes */}
          <Animate variant="fadeUp" delay={0.15}>
            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
              <label htmlFor="notes" className="block text-sm font-medium text-text-secondary mb-2">Order Notes (optional)</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Any special instructions..."
              />
            </div>
          </Animate>

          {error && <p className="text-danger text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
        </div>

        {/* Order Summary */}
        <Animate variant="fadeUp" delay={0.1}>
          <div className="h-fit sticky top-24 space-y-4">
            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
              <h3 className="font-display font-semibold text-lg mb-4">Order Summary</h3>
              <div className="space-y-3 mb-4">
                {items.map((item) => {
                  const unitPrice = getTieredPrice(item.priceTiers, item.quantity, item.price);
                  return (
                    <div key={cartLineKey(item)} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[8px] font-bold text-text-muted">{item.code}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold truncate">
                          {item.kitId ? item.name : item.code}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                          {item.kitId ? 'Kit' : item.name} &middot; Qty: {item.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-semibold shrink-0">{formatPrice(unitPrice * item.quantity)}</p>
                    </div>
                  );
                })}
              </div>

              {/* Discount Code */}
              <div className="border-t border-border pt-4 mb-4">
                {appliedDiscount ? (
                  <div className="flex items-center justify-between bg-success/10 border border-success/30 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-success" />
                      <span className="text-sm font-medium text-success">{appliedDiscount.code}</span>
                    </div>
                    <button type="button" onClick={handleRemoveDiscount} className="p-0.5 rounded hover:bg-success/20 transition-colors">
                      <X className="w-4 h-4 text-success" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <Input
                        id="discount"
                        value={discountCode}
                        onChange={(e) => { setDiscountCode(e.target.value); setDiscountError(''); }}
                        placeholder="Discount code"
                        className="flex-1 text-sm"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={handleApplyDiscount} disabled={discountLoading || !discountCode.trim()}>
                        {discountLoading ? '...' : 'Apply'}
                      </Button>
                    </div>
                    {discountError && <p className="text-xs text-danger mt-1.5">{discountError}</p>}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4 space-y-2 mb-5">
                <div className="flex justify-between text-sm text-text-secondary">
                  <span>Subtotal</span>
                  <span>{formatPrice(total)}</span>
                </div>
                {appliedDiscount && (
                  <div className="flex justify-between text-sm text-success">
                    <span>Discount</span>
                    <span>-{formatPrice(appliedDiscount.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-text-secondary">
                  <span>Shipping</span>
                  <span className={!shippingFee || shippingFee === '0' ? 'text-success font-medium' : ''}>
                    {!shippingFee || shippingFee === '0' ? 'Free' : formatPrice(shippingInSen)}
                  </span>
                </div>
                <div className="flex justify-between font-display font-bold text-lg pt-2 border-t border-border">
                  <span>Total</span>
                  <span>{formatPrice(orderTotal)}</span>
                </div>
                <p className="text-xs text-text-muted">Final pricing (including any bulk quantity breaks) is confirmed on your order.</p>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || !shippingAddressId || (!!company && !company.profileComplete)}
              >
                {loading ? 'Placing Order...' : payNow ? 'Place Order & Pay' : 'Place Order'}
              </Button>
            </div>

            {/* Trust Signals */}
            <div className="flex items-center justify-center gap-4 text-text-muted">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span className="text-xs">Secure</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="text-xs">Verified</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                <span className="text-xs">{!shippingFee || shippingFee === '0' ? 'Free Shipping' : 'Peninsular Malaysia Shipping'}</span>
              </div>
            </div>
          </div>
        </Animate>
      </form>
    </div>
  );
}
