// Single source of truth for "is this product on sale, and at what price" on
// the backend. Order creation (orders.controller.ts) uses this to compute the
// price actually charged — it must never trust a client-sent price.
//
// A mirrored copy of this logic lives in frontend/src/lib/utils.ts for
// storefront display and JSON-LD generation. Keep both in sync — a sale that
// looks active on the storefront but isn't recognized here (or vice versa)
// would either overcharge or undercharge a customer relative to what they see.

export interface SalePricing {
  price: number;
  salePrice: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

export function isSaleActive(product: SalePricing, now: Date = new Date()): boolean {
  if (product.salePrice == null || !product.saleStartsAt || !product.saleEndsAt) return false;
  return now >= product.saleStartsAt && now <= product.saleEndsAt;
}

export function getEffectivePrice(product: SalePricing, now: Date = new Date()): number {
  return isSaleActive(product, now) ? product.salePrice! : product.price;
}

export interface PriceTierLike {
  minQty: number;
  unitPrice: number;
}

// B2B quantity-break pricing: the row with the highest minQty <= the
// requested quantity wins (see PriceTier in schema.prisma). A matching tier
// takes priority over a time-limited sale price — a negotiated/bulk tier
// price is assumed to already be the better deal; there's no schema signal to
// compare the two and pick the lower, so tier > sale is a deliberate,
// documented choice rather than an oversight.
export function getTieredUnitPrice(
  variant: SalePricing & { priceTiers?: PriceTierLike[] },
  quantity: number,
  now: Date = new Date()
): number {
  const tiers = variant.priceTiers ?? [];
  let best: PriceTierLike | undefined;
  for (const tier of tiers) {
    if (tier.minQty <= quantity && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best ? best.unitPrice : getEffectivePrice(variant, now);
}
