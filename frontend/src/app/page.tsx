import { HomeClient } from './HomeClient';
import {
  getProductsServer,
  getSettingsServer,
  getProductServer,
  getCampaignsServer,
} from '@/lib/server-api';
import { getEffectivePrice } from '@/lib/utils';
import type { Product, HeroPriceExample } from '@/types';

/**
 * Picks the SKU whose published quantity breaks show the deepest per-unit
 * saving — that's the most honest demonstration of the trade proposition, and
 * it re-picks itself as pricing changes rather than naming a product in copy.
 *
 * Supplies (bac water, acetic acid) are excluded even when they discount
 * hardest — AA10 is the deepest in the catalogue at 36% — because the hero
 * should lead with a compound, not a consumable.
 */
function pickPriceExample(products: Product[]): HeroPriceExample | null {
  let best: HeroPriceExample | null = null;

  for (const product of products) {
    if (product.category?.slug === 'supplies') continue;

    for (const variant of product.variants) {
      if (!variant.active || !variant.priceTiers?.length) continue;

      const basePrice = getEffectivePrice(variant);
      const cheapest = variant.priceTiers.reduce((lo, t) => (t.unitPrice < lo.unitPrice ? t : lo));
      if (cheapest.unitPrice >= basePrice) continue;

      const savingPct = Math.round(((basePrice - cheapest.unitPrice) / basePrice) * 100);
      if (best && savingPct <= best.savingPct) continue;

      best = {
        slug: product.slug,
        code: variant.code,
        name: variant.size ? `${product.name} ${variant.size}` : product.name,
        basePrice,
        savingPct,
        bestMinQty: cheapest.minQty,
        tiers: [...variant.priceTiers]
          .sort((a, b) => a.minQty - b.minQty)
          .map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice })),
      };
    }
  }

  return best;
}

export default async function HomePage() {
  const [featuredRes, catalogueRes, settings, campaignsRes] = await Promise.all([
    getProductsServer({ featured: true, limit: 8 }),
    // Fetched unconditionally now: it's both the fallback list when nothing is
    // flagged featured AND the source of the hero's catalogue counts, which
    // must be real rather than hardcoded numbers that rot.
    getProductsServer({ limit: 100 }),
    getSettingsServer(),
    // Only OPEN campaigns come back from this endpoint, so a non-empty list
    // means there is genuinely something a buyer can pre-order right now.
    getCampaignsServer({ limit: 3 }),
  ]);

  const products = featuredRes.data.length > 0 ? featuredRes.data : catalogueRes.data.slice(0, 8);

  const compoundCount = catalogueRes.pagination.total;
  const skuCount = catalogueRes.data.reduce(
    (sum, p) => sum + p.variants.filter((v) => v.active).length,
    0
  );

  const shippingFee = settings.shipping_fee || '';
  const freeShipping = !shippingFee || shippingFee === '0';

  const hardsellSlug = settings.hardsell_product_slug || '';
  const hardsellEnabled = settings.hardsell_enabled === 'true' && !!hardsellSlug;
  const slide2Slug = settings.hardsell_slide2_product_slug || '';
  const slide2Enabled = settings.hardsell_slide2_enabled === 'true' && !!slide2Slug;

  const [hardsellProduct, hardsellSlide2Product] = await Promise.all([
    hardsellEnabled ? getProductServer(hardsellSlug) : Promise.resolve(null),
    slide2Enabled ? getProductServer(slide2Slug) : Promise.resolve(null),
  ]);

  return (
    <HomeClient
      products={products}
      openCampaigns={campaignsRes.data}
      compoundCount={compoundCount}
      skuCount={skuCount}
      priceExample={pickPriceExample(catalogueRes.data)}
      freeShipping={freeShipping}
      hardsellProduct={hardsellProduct}
      hardsellHeadline={settings.hardsell_headline || ''}
      hardsellSubheadline={settings.hardsell_subheadline || ''}
      hardsellSlide2Product={hardsellSlide2Product}
      hardsellSlide2Headline={settings.hardsell_slide2_headline || ''}
      hardsellSlide2Subheadline={settings.hardsell_slide2_subheadline || ''}
    />
  );
}
