import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, Package } from 'lucide-react';
import type { Metadata } from 'next';
import { getKitServer } from '@/lib/server-api';
import { Animate } from '@/components/ui/Animate';
import { Badge } from '@/components/ui/Badge';
import { KitPurchasePanel } from './KitPurchasePanel';

interface Props {
  params: Promise<{ id: string }>;
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const kit = await getKitServer(id);
  if (!kit) return { title: 'Kit not found | ASCEND' };

  return {
    title: `${kit.name} | ASCEND`,
    description: `${kit.name} — a ${kit.items.length}-product research kit supplied by ASCEND in Malaysia for laboratory research use only.`,
  };
}

export default async function KitDetailPage({ params }: Props) {
  const { id } = await params;
  const kit = await getKitServer(id);
  if (!kit) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/kits"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Kits
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted font-medium uppercase tracking-wider">
            <Package className="w-3.5 h-3.5" /> Kit
          </span>
          {kit.campaign && <Badge className="bg-orange-100 text-orange-800">Pre-order</Badge>}
        </div>
        <h1 className="font-display text-3xl font-bold mb-6">{kit.name}</h1>
      </Animate>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Animate variant="fadeUp" delay={0.1}>
            <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
              <h2 className="font-display font-semibold text-lg mb-4">What&apos;s in this kit</h2>
              {/* Laid out like the /products price list rather than a photo
                  list: code first, then the compound, then how many of it are
                  in one kit. No thumbnails — same call as the rest of the
                  storefront, and it was rendering a broken image locally
                  because /uploads is only mapped by nginx in production. */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="pb-2 font-medium text-text-secondary">SKU</th>
                    <th className="pb-2 font-medium text-text-secondary">Compound</th>
                    <th className="pb-2 font-medium text-text-secondary text-right whitespace-nowrap">
                      Per kit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {kit.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <Link
                          href={`/products/${item.variant.product.slug}`}
                          className="font-display font-bold tracking-wide hover:text-primary-light transition-colors"
                        >
                          {item.variant.code}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-text-secondary">
                        <Link
                          href={`/products/${item.variant.product.slug}`}
                          className="hover:text-primary-light transition-colors"
                        >
                          {item.variant.product.name}
                          {item.variant.size ? ` ${item.variant.size}` : ''}
                        </Link>
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                        &times;{item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Animate>

          {kit.campaign && (
            <Animate variant="fadeUp" delay={0.2}>
              <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
                <h2 className="font-display font-semibold text-lg mb-1 flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-text-muted" />
                  Pre-order campaign
                </h2>
                <p className="text-sm text-text-secondary mb-4">
                  This kit is part of{' '}
                  <Link
                    href={`/campaigns/${kit.campaign.id}`}
                    className="font-medium text-primary-light hover:underline"
                  >
                    {kit.campaign.name}
                  </Link>
                  . Ordering now reserves your allocation from the incoming batch.
                </p>
                <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wider">
                      Orders close
                    </dt>
                    <dd className="text-text-secondary">{formatDay(kit.campaign.closesAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted uppercase tracking-wider">
                      Estimated arrival
                    </dt>
                    <dd className="text-text-secondary">
                      {formatDay(kit.campaign.estimatedArrival)}
                    </dd>
                  </div>
                </dl>
              </div>
            </Animate>
          )}
        </div>

        <Animate variant="fadeUp" delay={0.15}>
          <div className="lg:sticky lg:top-24 space-y-4">
            <KitPurchasePanel kit={kit} />
            <div className="bg-surface rounded-xl border border-border p-5">
              <p className="text-sm text-text-secondary mb-3">
                Need a different mix or a larger volume than listed?
              </p>
              <Link
                href="/account/quotations"
                className="text-sm font-medium text-primary-light hover:underline"
              >
                Request a quote &rarr;
              </Link>
            </div>
          </div>
        </Animate>
      </div>
    </div>
  );
}
