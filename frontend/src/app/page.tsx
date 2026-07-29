import { HomeClient } from './HomeClient';
import {
  getProductsServer,
  getCategoriesServer,
  getSettingsServer,
  getProductServer,
  getCampaignsServer,
} from '@/lib/server-api';

export default async function HomePage() {
  const [featuredRes, catalogueRes, categories, settings, campaignsRes] = await Promise.all([
    getProductsServer({ featured: true, limit: 8 }),
    // Fetched unconditionally now: it's both the fallback list when nothing is
    // flagged featured AND the source of the hero's catalogue counts, which
    // must be real rather than hardcoded numbers that rot.
    getProductsServer({ limit: 100 }),
    getCategoriesServer(),
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
      categories={categories}
      openCampaigns={campaignsRes.data}
      compoundCount={compoundCount}
      skuCount={skuCount}
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
