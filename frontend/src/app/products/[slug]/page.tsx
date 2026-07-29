import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getProductServer, getProductsServer, getSettingsServer } from '@/lib/server-api';
import { Animate } from '@/components/ui/Animate';
import { SkuLinkList } from '@/components/products/SkuLinkList';
import { ProductReconstitutionSummary } from '@/components/guide/ProductReconstitutionSummary';
import {
  getRelatedProducts,
  getPairedSupplies,
  needsReconstitutionGuide,
  getRecommendedSolvent,
} from '@/lib/product-relations';
import { VariantSwitcher } from './VariantSwitcher';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductServer(slug);
  if (!product) notFound();

  const [settings, catalog] = await Promise.all([getSettingsServer(), getProductsServer({ limit: 100 })]);
  const shippingFee = settings.shipping_fee || '';
  const allProducts = catalog.data;

  const shownIds = new Set([product.id]);
  const relatedProducts = getRelatedProducts(product, allProducts, shownIds);
  relatedProducts.forEach((p) => shownIds.add(p.id));
  const pairedSupplies = getPairedSupplies(product, allProducts, shownIds);

  let benefits: string[] = [];
  try {
    if (product.benefits) benefits = JSON.parse(product.benefits);
  } catch {}

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/products" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Products
      </Link>

      {/* These per-parent sections are passed as children so they render
          inside VariantSwitcher's left column — that's what lets the purchase
          panel stay sticky beside the whole page instead of only beside a
          short hero. They're still server-rendered here. */}
      <VariantSwitcher product={product} benefits={benefits} shippingFee={shippingFee}>
        {product.dosageInfo && (
          <Animate variant="fadeUp" delay={0.2}>
            <div className="bg-surface rounded-xl border border-border p-6">
              <h2 className="font-display font-semibold text-lg mb-2">Research &amp; Reconstitution Information</h2>
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{product.dosageInfo}</p>
            </div>
          </Animate>
        )}

        {/* No Certificate of Analysis block here by design. Product.coaUrl is
            a single identical link shared by the whole catalogue, so per-product
            it said nothing — the /coa page still covers testing methodology,
            and per-batch COAs (which are genuinely per-shipment) stay on the
            campaign page and the order Files tab. */}

        {needsReconstitutionGuide(product) && (
          <ProductReconstitutionSummary solvent={getRecommendedSolvent(product)} />
        )}
      </VariantSwitcher>

      {/* Cross-sell runs full width below both columns. */}
      <SkuLinkList
        title="Frequently Paired With"
        products={pairedSupplies}
        delay={0.32}
      />

      <SkuLinkList
        title="Related Products"
        subtitle={`More from ${product.category.name}`}
        products={relatedProducts}
        delay={0.35}
      />
    </div>
  );
}
