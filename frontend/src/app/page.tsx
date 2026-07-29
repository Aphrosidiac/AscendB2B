import { HomeClient } from './HomeClient';
import {
  getProductsServer,
  getCategoriesServer,
  getSettingsServer,
  getProductServer,
  getCampaignsServer,
} from '@/lib/server-api';

export default async function HomePage() {
  const [featuredRes, categories, settings, campaignsRes] = await Promise.all([
    getProductsServer({ featured: true, limit: 8 }),
    getCategoriesServer(),
    getSettingsServer(),
    // Only OPEN campaigns come back from this endpoint, so a non-empty list
    // means there is genuinely something a buyer can pre-order right now.
    getCampaignsServer({ limit: 3 }),
  ]);

  const products =
    featuredRes.data.length > 0 ? featuredRes.data : (await getProductsServer({ limit: 8 })).data;

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
