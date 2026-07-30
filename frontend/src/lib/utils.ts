import { clsx, type ClassValue } from 'clsx';
import type { Product, ProductVariant, PriceTier } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(priceInSen: number): string {
  return `RM${(priceInSen / 100).toFixed(2)}`;
}

// Composes a variant's display name from its parent's name + its own size
// label (e.g. "Retatrutide" + "30mg" -> "Retatrutide 30mg"). Unlike the old
// flat model, `name` never bakes in size here, so no dedup check is needed.
export function getVariantDisplayName(product: { name: string }, variant: { size: string | null }): string {
  return variant.size ? `${product.name} ${variant.size}` : product.name;
}

// The variant shown by default on a product card / on first paint of the
// product page — the lowest-priced active variant. Used identically in both
// places so they never disagree about which size is "the" default.
export function getDefaultVariant(product: Product): ProductVariant | null {
  const active = product.variants.filter((v) => v.active);
  if (active.length === 0) return null;
  return active.reduce((min, v) => (v.price < min.price ? v : min));
}

const SITE_URL = 'https://ascendpeptides.my';

/**
 * Resolve a product/asset image path to an absolute URL. Uploaded product
 * images are stored as site-relative paths (`/uploads/products/...`), which
 * resolve fine in <img>/<Image> tags but are invalid in JSON-LD/OG metadata,
 * which require a fully-qualified URL.
 */
export function absoluteImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SITE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

// Single source of truth for "is this product on sale, and at what price" on
// the frontend — storefront display and JSON-LD generation. A mirrored copy
// of this logic lives in backend/src/utils/product-pricing.ts, which is what
// actually determines the price charged at checkout. Keep both in sync — a
// sale that looks active here but isn't recognized there (or vice versa)
// would show a price the customer isn't actually charged.
export interface SalePricing {
  price: number;
  salePrice: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
}

export function isSaleActive(product: SalePricing, now: Date = new Date()): boolean {
  if (product.salePrice == null || !product.saleStartsAt || !product.saleEndsAt) return false;
  const start = new Date(product.saleStartsAt);
  const end = new Date(product.saleEndsAt);
  return now >= start && now <= end;
}

export function getEffectivePrice(product: SalePricing, now: Date = new Date()): number {
  return isSaleActive(product, now) ? product.salePrice! : product.price;
}

// B2B quantity-break pricing display mirror — the tier with the highest
// minQty <= the requested quantity wins, else falls back to the (already
// sale-adjusted) `fallbackPrice`. Mirrors
// backend/src/utils/product-pricing.ts's getTieredUnitPrice, which is what
// actually computes the price charged at order creation; this is display
// only (cart/checkout totals are estimates until the order response comes
// back with the server-computed total).
export function getTieredPrice(priceTiers: PriceTier[] | undefined, quantity: number, fallbackPrice: number): number {
  if (!priceTiers || priceTiers.length === 0) return fallbackPrice;
  let best: PriceTier | undefined;
  for (const tier of priceTiers) {
    if (tier.minQty <= quantity && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best ? best.unitPrice : fallbackPrice;
}

/**
 * The cheapest quantity break a line hasn't reached yet, plus how many more
 * units it takes and what the whole line would then cost.
 *
 * This is the one thing a wholesale cart can tell a buyer that a retail cart
 * can't: you are three units away from a better unit price. Returns null when
 * the line is already on the deepest tier, or has no tiers at all.
 *
 * Display-only, same caveat as getTieredPrice — the server recomputes the
 * charged price at order creation.
 */
export function getNextTier(
  priceTiers: PriceTier[] | undefined,
  quantity: number,
  fallbackPrice: number
): { minQty: number; unitPrice: number; addMore: number; lineTotalAtTier: number; savingPerUnit: number } | null {
  if (!priceTiers || priceTiers.length === 0) return null;
  const current = getTieredPrice(priceTiers, quantity, fallbackPrice);

  // Lowest minQty above the current quantity that actually beats today's unit
  // price — a tier that isn't cheaper is not worth asking someone to buy into.
  let next: PriceTier | undefined;
  for (const tier of priceTiers) {
    if (tier.minQty <= quantity) continue;
    if (tier.unitPrice >= current) continue;
    if (!next || tier.minQty < next.minQty) next = tier;
  }
  if (!next) return null;

  return {
    minQty: next.minQty,
    unitPrice: next.unitPrice,
    addMore: next.minQty - quantity,
    lineTotalAtTier: next.unitPrice * next.minQty,
    savingPerUnit: current - next.unitPrice,
  };
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Day-only variant of formatDate, for dates where a time-of-day isn't
// meaningful the way an order timestamp is (invoice issue/due dates,
// shipment dates, analytics period bounds).
export function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Normalize Malaysian phone numbers to digits-only format: 01XXXXXXXXX
 * Handles: +60132719008, 60132719008, 013-271 9008, 013 271 9008, etc.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('60') && digits.length >= 10 && digits.length <= 12) {
    return '0' + digits.slice(2);
  }
  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) {
    return digits;
  }
  return digits || raw.trim();
}
