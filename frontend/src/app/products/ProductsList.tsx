import { getProductsServer } from '@/lib/server-api';
import { ProductsTable } from '@/components/products/ProductsTable';
import { Animate } from '@/components/ui/Animate';

interface ProductsListProps {
  category?: string;
  search?: string;
}

export async function ProductsList({ category, search }: ProductsListProps) {
  // limit 100: catalog is at 16 parent products / 21 sellable SKUs as of
  // 2026-07; headroom so growth doesn't silently drop rows from the listing.
  const productsRes = await getProductsServer({ category, search, limit: 100 });

  // No separate Featured rail any more — it was a picture-card carousel, and
  // this list is picture-free. The products API already orders featured first,
  // so they surface at the top of the list on their own and carry a "Featured"
  // marker in the row instead.
  return (
    <Animate variant="fadeUp" delay={0.05} duration={0.5}>
      <ProductsTable products={productsRes.data} showCategory={!category} />
    </Animate>
  );
}
