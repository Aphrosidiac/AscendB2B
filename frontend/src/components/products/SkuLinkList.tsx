import Link from 'next/link';
import type { Product } from '@/types';
import { formatPrice, getDefaultVariant, getEffectivePrice } from '@/lib/utils';
import { Animate } from '@/components/ui/Animate';

interface SkuLinkListProps {
  title: string;
  subtitle?: string;
  products: Product[];
  delay?: number;
}

// Picture-free cross-sell for the product page, replacing the image-card
// rails. A buyer only needs the code, the compound and what it costs to
// decide whether to open it. (ProductCard itself is still alive, used by the
// homepage grid, which deliberately keeps its imagery.)
export function SkuLinkList({ title, subtitle, products, delay = 0.3 }: SkuLinkListProps) {
  if (products.length === 0) return null;

  return (
    <Animate variant="fadeUp" delay={delay}>
      <div className="mt-10">
        <h2 className="font-display font-semibold text-lg mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-text-secondary mb-3">{subtitle}</p>}
        {!subtitle && <div className="mb-3" />}
        <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
          {products.map((product) => {
            const variant = getDefaultVariant(product);
            const activeVariants = product.variants.filter((v) => v.active);
            // "From" only when active sizes genuinely differ in price — a flat
            // price on a single-price product needs no hedge.
            const spread =
              activeVariants.length > 1 &&
              new Set(activeVariants.map((v) => getEffectivePrice(v))).size > 1;

            return (
              <li key={product.id}>
                <Link
                  href={`/products/${product.slug}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated/60 transition-colors"
                >
                  <span className="font-display font-bold tracking-wide text-sm shrink-0">
                    {variant?.code ?? product.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-sm text-text-secondary min-w-0 truncate">
                    {product.name}
                    {variant?.size ? ` ${variant.size}` : ''}
                  </span>
                  {variant && (
                    <span className="ml-auto shrink-0 text-sm tabular-nums whitespace-nowrap">
                      {spread && <span className="text-text-muted text-xs">from </span>}
                      <span className="font-medium">{formatPrice(getEffectivePrice(variant))}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Animate>
  );
}
