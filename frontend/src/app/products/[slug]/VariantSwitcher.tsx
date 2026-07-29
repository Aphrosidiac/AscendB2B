'use client';

import { useState, type ReactNode } from 'react';
import { ShieldCheck, Truck, Package, Receipt } from 'lucide-react';
import { Animate } from '@/components/ui/Animate';
import { formatPrice, getDefaultVariant, getEffectivePrice, getVariantDisplayName, isSaleActive } from '@/lib/utils';
import { AddToCartPanel } from './AddToCartPanel';
import { SkuBadge } from '@/components/products/SkuBadge';
import { PriceTierTable } from '@/components/products/PriceTierTable';
import type { Product } from '@/types';

interface Props {
  product: Product;
  benefits: string[];
  shippingFee: string;
  // Per-parent sections (research info, COA, reconstitution summary) rendered
  // on the server in page.tsx and slotted into this component's left column,
  // so the purchase panel can stay sticky beside the full length of the page
  // rather than only beside a short hero.
  children?: ReactNode;
}

// Everything price/stock-reactive lives here so picking a different size swaps
// it together without navigating. There is deliberately no product photography
// anywhere on this page — same call as the /products list.
export function VariantSwitcher({ product, benefits, shippingFee, children }: Props) {
  const activeVariants = product.variants.filter((v) => v.active);
  const defaultVariant = getDefaultVariant(product);
  const [selectedId, setSelectedId] = useState(defaultVariant?.id ?? '');
  const variant = activeVariants.find((v) => v.id === selectedId) ?? defaultVariant;

  if (!variant) {
    return <p className="text-danger font-medium py-8">This product is currently unavailable.</p>;
  }

  const onSale = isSaleActive(variant);
  const effectivePrice = getEffectivePrice(variant);
  const freeShipping = !shippingFee || shippingFee === '0';

  return (
    <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
      <div className="lg:col-span-2 space-y-6">
        <Animate variant="fadeUp" duration={0.5}>
          <div>
            <p className="text-sm text-text-muted font-medium uppercase tracking-wider mb-1">
              {product.category.name}
            </p>
            <SkuBadge code={variant.code} size="lg" className="block mb-1" />
            {/* Text and tag unchanged for SEO (matches generateMetadata's
                <title>) — the code above carries the visual weight. */}
            <h1 className="font-display text-base sm:text-lg font-medium text-text-secondary">
              {product.name}
            </h1>
          </div>
        </Animate>

        {/* Size picker, text-only. Each option carries its own SKU code and
            unit price, which is what a buyer is actually choosing between — a
            row of near-identical vial photos never was. */}
        {activeVariants.length > 1 && (
          <Animate variant="fadeUp" delay={0.05} duration={0.5}>
            <div>
              <h2 className="font-display font-semibold mb-2 text-sm text-text-secondary">
                Available sizes
              </h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a size">
                {activeVariants.map((v) => {
                  const selected = v.id === variant.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      aria-pressed={selected}
                      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 min-w-[104px] transition-colors cursor-pointer ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-border-hover'
                      }`}
                    >
                      <span className="text-sm font-medium">{v.size ?? v.code}</span>
                      <span className="font-display font-bold text-sm tabular-nums">
                        {formatPrice(getEffectivePrice(v))}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {v.stock === 0 ? 'Out of stock' : v.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Animate>
        )}

        {product.description && (
          <Animate variant="fadeUp" delay={0.1} duration={0.5}>
            <p className="text-text-secondary leading-relaxed">{product.description}</p>
          </Animate>
        )}

        {variant.priceTiers.length > 0 && (
          <Animate variant="fadeUp" delay={0.12} duration={0.5}>
            <div>
              <h2 className="font-display font-semibold mb-2 text-sm text-text-secondary">
                Bulk pricing
              </h2>
              <PriceTierTable priceTiers={variant.priceTiers} basePrice={effectivePrice} />
            </div>
          </Animate>
        )}

        {benefits.length > 0 && (
          <Animate variant="fadeUp" delay={0.15} duration={0.5}>
            <div className="bg-surface rounded-xl border border-border p-5">
              {/* Neutral heading rather than "Benefits" — this catalogue's copy
                  is deliberately kept to properties of the compound, not
                  outcomes for a person. */}
              <h2 className="font-display font-semibold text-base mb-3">Product details</h2>
              <ul className="space-y-1.5">
                {benefits.map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-text-secondary">
                    <span className="text-text-muted shrink-0" aria-hidden="true">
                      &mdash;
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </Animate>
        )}

        {children}
      </div>

      {/* Purchase panel — sticky beside the full page, not just beside a hero. */}
      <Animate variant="fadeUp" delay={0.08} duration={0.5}>
        <div className="lg:sticky lg:top-24 h-fit space-y-4">
          <div className="bg-surface rounded-xl border border-border p-5">
            <div className="flex items-baseline gap-2.5">
              <p className="font-display text-3xl font-bold">{formatPrice(effectivePrice)}</p>
              {onSale && (
                <p className="text-lg text-text-muted line-through">{formatPrice(variant.price)}</p>
              )}
              <span className="text-sm text-text-muted">per unit</span>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              {variant.moq > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-text-secondary">
                    <Package className="w-4 h-4 shrink-0 text-text-muted" /> Min. order
                  </dt>
                  <dd className="font-medium tabular-nums">{variant.moq} units</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Availability</dt>
                {/* An exact figure rather than retail scarcity language — a
                    trade buyer sizing an order needs the number. */}
                <dd className={`font-medium tabular-nums ${variant.stock === 0 ? 'text-danger' : ''}`}>
                  {variant.stock === 0 ? 'Out of stock' : `${variant.stock} units`}
                </dd>
              </div>
            </dl>

            <AddToCartPanel
              key={variant.id}
              variantId={variant.id}
              code={variant.code}
              name={getVariantDisplayName(product, variant)}
              size={variant.size}
              price={effectivePrice}
              imageUrl={variant.imageUrl}
              stock={variant.stock}
              moq={variant.moq}
              priceTiers={variant.priceTiers}
              addOns={product.addOns}
              addOnReminder={product.addOnReminder}
            />

            <p className="text-xs text-text-muted italic mt-3">
              For research and laboratory use only.
            </p>
          </div>

          {/* Trade facts, replacing the retail "Free Shipping / 3rd Party
              Verified" badge pair. The credit-terms wording matches the
              homepage's existing published copy. */}
          <ul className="bg-surface rounded-xl border border-border divide-y divide-border text-sm">
            <li className="flex items-start gap-2.5 px-4 py-3">
              <ShieldCheck className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
              <span className="text-text-secondary">
                Third-party tested for identity and purity
              </span>
            </li>
            <li className="flex items-start gap-2.5 px-4 py-3">
              <Receipt className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
              <span className="text-text-secondary">
                Net 15, 30 or 60 credit terms for approved trade accounts
              </span>
            </li>
            <li className="flex items-start gap-2.5 px-4 py-3">
              <Truck className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
              <span className="text-text-secondary">
                {freeShipping
                  ? 'Free delivery on all orders across Peninsular Malaysia'
                  : `Delivery RM${shippingFee} across Peninsular Malaysia`}
              </span>
            </li>
          </ul>
        </div>
      </Animate>
    </div>
  );
}
