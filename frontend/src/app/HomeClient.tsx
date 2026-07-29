'use client';

import Link from 'next/link';
import { ArrowRight, FileText, Layers, FlaskConical, CreditCard, CalendarClock, Package } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SkuLinkList } from '@/components/products/SkuLinkList';
import { Animate, Stagger } from '@/components/ui/Animate';
import { HardsellCarousel } from '@/components/home/HardsellCarousel';
import type { HardsellAccent } from '@/components/home/HardsellSlide';
import { getCategoryIcon } from '@/lib/category-icons';
import type { Product, Category, PublicCampaign } from '@/types';

// Both hardsell slides share one accent — the green/blue split this used to
// have was the only place on the site that broke the monochrome-accent rule.
// `solid` needs to read as a distinct raised chip against the section's own
// `bg-primary` (#0A0A0A) while still passing contrast for the white text/icon
// classes hardcoded onto it in HardsellSlide.tsx.
const MONO_ACCENT: HardsellAccent = {
  solid: '#404040',
  bright: '#FFFFFF',
  glow: 'rgba(255,255,255,0.05)',
  shadow: 'rgba(0,0,0,0.45)',
  shadowHover: 'rgba(0,0,0,0.6)',
};

interface HomeClientProps {
  products: Product[];
  categories: Category[];
  // Currently-open pre-order campaigns. Empty is the normal state — the
  // section simply doesn't render rather than showing an empty placeholder.
  openCampaigns: PublicCampaign[];
  // Real catalogue size for the hero's fact strip — hardcoded numbers rot the
  // moment a SKU is added.
  compoundCount: number;
  skuCount: number;
  freeShipping: boolean;
  hardsellProduct: Product | null;
  hardsellHeadline: string;
  hardsellSubheadline: string;
  hardsellSlide2Product: Product | null;
  hardsellSlide2Headline: string;
  hardsellSlide2Subheadline: string;
}

export function HomeClient({
  products,
  categories,
  openCampaigns,
  compoundCount,
  skuCount,
  freeShipping,
  hardsellProduct,
  hardsellHeadline,
  hardsellSubheadline,
  hardsellSlide2Product,
  hardsellSlide2Headline,
  hardsellSlide2Subheadline,
}: HomeClientProps) {
  return (
    <div>
      {/* Hero — typographic. The old one led with a vials photo, a molecular
          network animation and a jiggle-on-hover interaction: consumer
          storefront furniture that told a trade buyer nothing. */}
      <section className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-3xl">
            <Animate variant="fade" duration={0.8}>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400 mb-6">
                ASCEND &middot; Trade Supply
              </p>
            </Animate>
            <Animate variant="fadeUp" delay={0.1} duration={0.7}>
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] mb-6">
                Research peptides,
                <br />
                supplied at trade prices
              </h1>
            </Animate>
            <Animate variant="fadeUp" delay={0.2} duration={0.7}>
              <p className="text-lg text-neutral-300 mb-8 max-w-xl leading-relaxed">
                Quantity-break pricing, invoiced credit terms and quoted volume for clinics,
                pharmacies and research laboratories across Malaysia. Approved accounts see unit
                costs fall as order size rises &mdash; no negotiation needed for standard volume.
              </p>
            </Animate>

            {/* Trade account first: for a wholesale buyer, opening the account
                is the conversion. Browsing the price list is secondary. */}
            <Animate variant="fadeUp" delay={0.3} duration={0.7}>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup">
                  <Button variant="secondary" size="lg">
                    Apply for a trade account <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link
                  href="/products"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-6 py-3 text-base font-medium text-white hover:bg-white/10 transition-colors"
                >
                  View the price list
                </Link>
              </div>
            </Animate>
          </div>

          {/* Counts come from the live catalogue, not hardcoded copy. */}
          <Animate variant="fadeUp" delay={0.4} duration={0.7}>
            <dl className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 border-t border-white/10 pt-8">
              <div>
                <dt className="text-xs uppercase tracking-wider text-neutral-500">Compounds</dt>
                <dd className="font-display text-2xl font-bold mt-1 tabular-nums">{compoundCount}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-neutral-500">Stocked SKUs</dt>
                <dd className="font-display text-2xl font-bold mt-1 tabular-nums">{skuCount}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-neutral-500">Credit terms</dt>
                <dd className="font-display text-2xl font-bold mt-1">Net 15&ndash;60</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-neutral-500">Delivery</dt>
                <dd className="font-display text-2xl font-bold mt-1">
                  {freeShipping ? 'Included' : 'Flat rate'}
                </dd>
              </div>
            </dl>
          </Animate>
        </div>
      </section>

      {/* Supply-quality facts only. This was four cards — Lab-Grade Quality,
          Bulk Pricing, Credit Terms, Quotes on Request — but three of those
          now restate the how-it-works steps below, so it is trimmed to what
          those steps don't cover. */}
      <section className="border-b border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Stagger
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            stagger={0.1}
          >
            {[
              { Icon: FlaskConical, label: 'Third-party tested', detail: 'Identity and purity, per batch' },
              { Icon: Layers, label: '99%+ purity', detail: 'Lab-grade across the catalogue' },
              { Icon: Package, label: 'Cold-chain aware', detail: 'Temperature-conscious packaging' },
              { Icon: CreditCard, label: 'MYR invoicing', detail: 'No hidden fees or FX surprises' },
            ].map(({ Icon, label, detail }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-display font-semibold text-sm">{label}</p>
                  <p className="text-sm text-text-secondary">{detail}</p>
                </div>
              </div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* How a trade account works — the page had no account/ordering
          explanation at all, which is the first thing a wholesale buyer needs
          and the one thing a retail homepage never has to answer. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Animate variant="fadeUp">
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
            How a trade account works
          </h2>
          <p className="text-text-secondary mb-8 max-w-2xl">
            Pricing, terms and stock are all account-based. Retail checkout does not apply here.
          </p>
        </Animate>
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" stagger={0.1}>
          {[
            {
              n: '01',
              title: 'Apply',
              body: 'Submit your business details. We verify the account before it is opened.',
            },
            {
              n: '02',
              title: 'Terms set',
              body: 'Approved accounts are assigned Net 15, 30 or 60 and settle by invoice rather than at checkout.',
            },
            {
              n: '03',
              title: 'Order at tier price',
              body: 'Published quantity breaks apply automatically. Minimum order quantities are listed per SKU.',
            },
            {
              n: '04',
              title: 'Quote for volume',
              body: 'Beyond the published tiers, request a quote and we price it directly before you commit.',
            },
          ].map((step) => (
            <div key={step.n} className="bg-surface rounded-xl border border-border p-5">
              <p className="font-display text-sm font-bold text-text-muted tabular-nums mb-3">
                {step.n}
              </p>
              <h3 className="font-display font-semibold mb-1.5">{step.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{step.body}</p>
            </div>
          ))}
        </Stagger>
        <Animate variant="fadeUp" delay={0.3}>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button size="lg">
                Apply for a trade account <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link
              href="/account/quotations"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
            >
              <FileText className="w-4 h-4" /> Request a quote
            </Link>
          </div>
        </Animate>
      </section>

      {(() => {
        const slides = [
          hardsellProduct && {
            product: hardsellProduct,
            headline: hardsellHeadline,
            subheadline: hardsellSubheadline,
            accent: MONO_ACCENT,
          },
          hardsellSlide2Product && {
            product: hardsellSlide2Product,
            headline: hardsellSlide2Headline,
            subheadline: hardsellSlide2Subheadline,
            accent: MONO_ACCENT,
          },
        ].filter((s): s is NonNullable<typeof s> => Boolean(s));

        return slides.length > 0 && <HardsellCarousel slides={slides} />;
      })()}

      {/* Open pre-order campaigns. Time-limited and easy to miss, so they sit
          above the catalogue rather than being buried behind the Kits nav
          entry. Renders nothing at all when no campaign is open. */}
      {openCampaigns.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Animate variant="fadeUp">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-2xl md:text-3xl font-bold">Open for pre-order</h2>
              <Link
                href="/kits"
                className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap"
              >
                All kits <ArrowRight className="w-4 h-4 inline" />
              </Link>
            </div>
            <p className="text-text-secondary mb-6 max-w-2xl">
              Secure allocation from an incoming batch before it lands. Kits are priced per kit and
              list exactly what they contain.
            </p>
          </Animate>
          {/* Full-width rows rather than a 2-up card grid: there is usually
              exactly one open campaign, and a half-width card left a visibly
              lopsided gap. Stacking also matches the list-over-cards direction
              of the rest of the storefront. */}
          <Stagger className="space-y-3" stagger={0.08}>
            {openCampaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="group block bg-surface rounded-xl border border-border hover:border-border-hover hover:shadow-md transition-all duration-300 p-5 sm:p-6"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarClock className="w-4 h-4 text-text-muted shrink-0" />
                    <h3 className="font-display font-semibold text-lg truncate group-hover:text-primary-light transition-colors">
                      {campaign.name}
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-muted shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wider">Closes</dt>
                    <dd className="text-text-secondary mt-0.5">
                      {new Date(campaign.closesAt).toLocaleDateString('en-MY', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wider">Est. arrival</dt>
                    <dd className="text-text-secondary mt-0.5">
                      {new Date(campaign.estimatedArrival).toLocaleDateString('en-MY', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wider">Kits</dt>
                    <dd className="text-text-secondary mt-0.5 inline-flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 shrink-0 text-text-muted" />
                      {campaign.kits.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wider">Arriving</dt>
                    <dd className="text-text-secondary mt-0.5">
                      {campaign.batches.length}{' '}
                      {campaign.batches.length === 1 ? 'line' : 'lines'}
                    </dd>
                  </div>
                </dl>
              </Link>
            ))}
          </Stagger>
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Animate variant="fadeUp">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-8">Shop by Category</h2>
          </Animate>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" stagger={0.08}>
            {categories.filter(c => c.slug !== 'supplies').map((cat) => {
              const CategoryIcon = getCategoryIcon(cat.slug);
              return (
                <Link
                  key={cat.slug}
                  href={`/products?category=${cat.slug}`}
                  className="group bg-surface rounded-xl border border-border hover:border-border-hover hover:shadow-md transition-all duration-300 p-6"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CategoryIcon className="w-5 h-5 text-text-primary shrink-0" />
                    <h3 className="font-display font-semibold text-lg group-hover:text-primary-light transition-colors">{cat.name}</h3>
                  </div>
                  <p className="text-sm text-text-secondary mb-3">{cat.description}</p>
                  <span className="text-sm font-medium text-text-muted">{cat.productCount} products</span>
                </Link>
              );
            })}
          </Stagger>
        </section>
      )}


      {/* Featured Products — a price list, not an image grid, matching
          /products and the product page. */}
      {products.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Animate variant="fadeUp">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-2xl md:text-3xl font-bold">Featured Products</h2>
              <Link href="/products" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap">
                View all <ArrowRight className="w-4 h-4 inline" />
              </Link>
            </div>
          </Animate>
          <SkuLinkList products={products} delay={0.05} />
        </section>
      )}


      {/* SEO content */}
      <section className="border-t border-border bg-surface/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Animate variant="fadeUp">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">Wholesale Research Peptides in Malaysia</h2>
            <div className="space-y-4 text-text-secondary leading-relaxed">
              <p>
                ASCEND supplies clinics, pharmacies, and research laboratories across Malaysia with lab-grade
                compounds including{' '}
                <Link href="/products" className="text-primary-light hover:underline">Retatrutide, GHK-Cu, BPC-157, Tesamorelin, MOTS-c and AOD9604</Link>,
                all manufactured to 99%+ purity with third-party Certificates of Analysis available on request.
              </p>
              <p>
                Every product carries quantity-break pricing, so your unit cost falls as volume rises. Approved
                business accounts order on Net 15, 30, or 60 credit terms and settle by invoice rather than paying
                at checkout. For volume beyond our published tiers,{' '}
                <Link href="/account/quotations" className="text-primary-light hover:underline">request a quote</Link>{' '}
                and we will price it directly.
              </p>
              <p>
                {freeShipping ? (
                  <>Orders ship free across Peninsular Malaysia — from the Klang Valley to every other state — in
                  temperature-conscious packaging.</>
                ) : (
                  <>Orders are delivered across Peninsular Malaysia — from the Klang Valley to every other state — in
                  temperature-conscious packaging.</>
                )}{' '}
                Prices are listed in Malaysian Ringgit (MYR) with no hidden fees. Sign in to your business account to{' '}
                <Link href="/account/orders" className="text-primary-light hover:underline">track orders</Link> and{' '}
                <Link href="/account/invoices" className="text-primary-light hover:underline">review outstanding invoices</Link>.
              </p>
              <p>
                Ahead of a restock we open{' '}
                <Link href="/kits" className="text-primary-light hover:underline">pre-order campaigns</Link>{' '}
                against an incoming batch, with the closing date and estimated arrival published up
                front. Pre-assembled kits are priced per kit and list exactly which SKUs and
                quantities they contain.
              </p>
              <p>
                Not yet set up with us?{' '}
                <Link href="/signup" className="text-primary-light hover:underline">Apply for a trade account</Link>{' '}
                to see bulk pricing, or read our{' '}
                <Link href="/guide" className="text-primary-light hover:underline">peptide reconstitution and storage guide</Link>{' '}
                and{' '}
                <Link href="/faq" className="text-primary-light hover:underline">frequently asked questions</Link>.
              </p>
              <p className="text-xs text-text-muted pt-2">
                All products are sold strictly for laboratory and research purposes only.
              </p>
            </div>
          </Animate>
        </div>
      </section>
    </div>
  );
}
