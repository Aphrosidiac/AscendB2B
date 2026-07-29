'use client';

import Link from 'next/link';
import { ShoppingCart, Check } from 'lucide-react';
import { useState } from 'react';
import type { Product, ProductVariant } from '@/types';
import { formatPrice, getEffectivePrice, getVariantDisplayName, isSaleActive } from '@/lib/utils';
import { useCart } from '@/lib/cart';

interface ProductsTableProps {
  products: Product[];
  // False when the list is already filtered to one category — the column
  // would then repeat the same value on every row, spending width on nothing.
  showCategory?: boolean;
}

// One row per sellable SKU rather than per parent product. A trade price list
// is scanned for a specific size at a specific price, so every row carries a
// real price, MOQ and stock figure — a per-product row would have to hedge
// with "From RMx" and could not offer an unambiguous Add button for a
// compound sold in three sizes.
interface SkuRow {
  product: Product;
  variant: ProductVariant;
}

function flatten(products: Product[]): SkuRow[] {
  return products.flatMap((product) =>
    product.variants
      .filter((v) => v.active)
      // Ascending price within a compound, so 10mg/20mg/30mg read in order.
      .slice()
      .sort((a, b) => a.price - b.price)
      .map((variant) => ({ product, variant }))
  );
}

// Deepest quantity break a buyer can reach, shown only when it actually beats
// the single-unit price — an equal-price tier is noise, not a saving.
function bestTier(variant: ProductVariant) {
  if (!variant.priceTiers?.length) return null;
  const cheapest = variant.priceTiers.reduce((best, t) => (t.unitPrice < best.unitPrice ? t : best));
  return cheapest.unitPrice < getEffectivePrice(variant) ? cheapest : null;
}

function stockLabel(stock: number): { text: string; className: string } {
  if (stock === 0) return { text: 'Out of stock', className: 'text-danger' };
  if (stock <= 10) return { text: `Low · ${stock}`, className: 'text-orange-600' };
  return { text: 'In stock', className: 'text-text-secondary' };
}

function useAddSku() {
  const { addItem } = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);

  return {
    addedId,
    add(product: Product, variant: ProductVariant) {
      addItem({
        variantId: variant.id,
        code: variant.code,
        name: getVariantDisplayName(product, variant),
        size: variant.size,
        // Base (sale-effective) unit price, NOT the tier price — the cart
        // re-derives the right tier as quantity changes.
        price: getEffectivePrice(variant),
        // Start at the purchase floor. Adding a single unit of a MOQ-10 SKU
        // would only be silently corrected by the cart's own clamp.
        quantity: Math.max(1, variant.moq),
        stock: variant.stock,
        moq: variant.moq,
        priceTiers: variant.priceTiers,
        imageUrl: variant.imageUrl,
      });
      setAddedId(variant.id);
      setTimeout(() => setAddedId((cur) => (cur === variant.id ? null : cur)), 1800);
    },
  };
}

export function ProductsTable({ products, showCategory = true }: ProductsTableProps) {
  const rows = flatten(products);
  const { add, addedId } = useAddSku();

  if (rows.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted text-lg">No products found.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: the full price list. Wide by design — every column a trade
          buyer needs to decide without opening a product page. */}
      <div className="hidden md:block bg-surface rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-elevated">
            <tr className="text-left">
              {/* Product is the only flexible column — every other cell
                  shrinks to its content (w-px + nowrap), which keeps the
                  numeric columns grouped on the right instead of drifting
                  apart across a wide viewport. */}
              <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium text-text-secondary">SKU</th>
              <th className="w-full px-4 py-2.5 font-medium text-text-secondary">Product</th>
              {showCategory && (
                <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium text-text-secondary">Category</th>
              )}
              <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium text-text-secondary text-right">MOQ</th>
              <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium text-text-secondary text-right">Unit price</th>
              <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium text-text-secondary text-right">Bulk price</th>
              <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium text-text-secondary">Availability</th>
              <th className="w-px px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ product, variant }) => {
              const tier = bestTier(variant);
              const stock = stockLabel(variant.stock);
              const onSale = isSaleActive(variant);
              const added = addedId === variant.id;
              return (
                <tr key={variant.id} className="hover:bg-surface-elevated/60 transition-colors">
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Link
                      href={`/products/${product.slug}`}
                      className="font-display font-bold tracking-wide hover:text-primary-light transition-colors"
                    >
                      {variant.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/products/${product.slug}`}
                      className="text-text-primary hover:text-primary-light transition-colors"
                    >
                      {product.name}
                      {variant.size ? ` ${variant.size}` : ''}
                    </Link>
                    {product.featured && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-text-muted">
                        Featured
                      </span>
                    )}
                  </td>
                  {showCategory && (
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                      {product.category?.name ?? '—'}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary tabular-nums">
                    {variant.moq > 1 ? variant.moq : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                    <span className="font-display font-bold">
                      {formatPrice(getEffectivePrice(variant))}
                    </span>
                    {onSale && (
                      <span className="ml-1.5 text-xs text-text-muted line-through">
                        {formatPrice(variant.price)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-text-secondary">
                    {tier ? (
                      <>
                        {formatPrice(tier.unitPrice)}
                        <span className="text-text-muted"> @ {tier.minQty}+</span>
                      </>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 whitespace-nowrap ${stock.className}`}>{stock.text}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => add(product, variant)}
                      disabled={variant.stock === 0}
                      aria-label={`Add ${getVariantDisplayName(product, variant)} to cart`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface hover:border-border-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {added ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Added
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-3.5 h-3.5" /> Add
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: the same rows, stacked. A horizontally scrolling 8-column
          table would technically fit but can't be scanned one-handed. */}
      <div className="md:hidden bg-surface rounded-xl border border-border divide-y divide-border">
        {rows.map(({ product, variant }) => {
          const tier = bestTier(variant);
          const stock = stockLabel(variant.stock);
          const onSale = isSaleActive(variant);
          const added = addedId === variant.id;
          return (
            <div key={variant.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/products/${product.slug}`} className="block">
                    <span className="font-display font-bold tracking-wide">{variant.code}</span>
                    <span className="block text-sm text-text-secondary truncate">
                      {product.name}
                      {variant.size ? ` ${variant.size}` : ''}
                    </span>
                  </Link>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-display font-bold whitespace-nowrap">
                    {formatPrice(getEffectivePrice(variant))}
                  </span>
                  {onSale && (
                    <span className="block text-xs text-text-muted line-through">
                      {formatPrice(variant.price)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-text-muted min-w-0 truncate">
                  {tier && <>{formatPrice(tier.unitPrice)} @ {tier.minQty}+</>}
                  {tier && variant.moq > 1 && ' · '}
                  {variant.moq > 1 && <>MOQ {variant.moq}</>}
                  {!tier && variant.moq <= 1 && showCategory && (product.category?.name ?? '')}
                </p>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs whitespace-nowrap ${stock.className}`}>{stock.text}</span>
                  <button
                    type="button"
                    onClick={() => add(product, variant)}
                    disabled={variant.stock === 0}
                    aria-label={`Add ${getVariantDisplayName(product, variant)} to cart`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {added ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                    {added ? 'Added' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
