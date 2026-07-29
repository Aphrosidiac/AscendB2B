import { Suspense } from 'react';
import { ProductsList } from './ProductsList';
import { ProductsFilters } from './ProductsFilters';
import { getCategoriesServer, getProductsServer } from '@/lib/server-api';
import { JsonLd } from '@/components/JsonLd';

const BASE_URL = 'https://ascendpeptides.my';

function CollectionJsonLd({ products }: { products: { name: string; slug: string }[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Buy Research Peptides in Malaysia',
    url: `${BASE_URL}/products`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE_URL}/products/${p.slug}`,
        name: p.name,
      })),
    },
  };

  return <JsonLd data={data} />;
}

interface ProductsPageProps {
  searchParams: Promise<{ category?: string; search?: string }>;
}

// Mirrors the real list's row rhythm so the swap-in doesn't jump the page.
function ListSkeleton() {
  return (
    <div className="bg-surface rounded-xl border border-border divide-y divide-border">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
          <div className="h-4 bg-surface-elevated rounded w-16 shrink-0" />
          <div className="h-4 bg-surface-elevated rounded w-48" />
          <div className="h-4 bg-surface-elevated rounded w-24 hidden md:block" />
          <div className="h-4 bg-surface-elevated rounded w-16 ml-auto" />
          <div className="h-7 bg-surface-elevated rounded-lg w-16 shrink-0 hidden md:block" />
        </div>
      ))}
    </div>
  );
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { category, search } = await searchParams;
  const isUnfiltered = !category && !search;

  const [categories, catalog] = await Promise.all([
    getCategoriesServer(),
    isUnfiltered ? getProductsServer({ limit: 100 }) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {catalog && <CollectionJsonLd products={catalog.data} />}
      <h1 className="font-display text-3xl font-bold mb-3">Wholesale Peptide Catalogue</h1>
      <p className="text-text-secondary mb-8 max-w-2xl leading-relaxed">
        ASCEND&apos;s full trade range — including Retatrutide, GHK-Cu, BPC-157, Tesamorelin, MOTS-c and
        AOD9604. Every compound is lab-grade and tested to 99%+ purity. One line per SKU: unit price is
        per unit at quantity one, and the bulk price is the deepest quantity break available, applied
        automatically as volume rises.
      </p>

      <ProductsFilters categories={categories} selectedCategory={category ?? null} search={search ?? ''} />

      <Suspense key={`${category ?? ''}:${search ?? ''}`} fallback={<ListSkeleton />}>
        <ProductsList category={category} search={search} />
      </Suspense>
    </div>
  );
}
