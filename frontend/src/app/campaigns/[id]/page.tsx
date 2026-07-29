import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, FileCheck2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getCampaignServer } from '@/lib/server-api';
import { Animate, Stagger } from '@/components/ui/Animate';
import { KitCard } from '@/components/kits/KitCard';

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
  const campaign = await getCampaignServer(id);
  if (!campaign) return { title: 'Campaign not found | ASCEND' };

  return {
    title: `${campaign.name} | ASCEND`,
    description: `Pre-order campaign closing ${formatDay(campaign.closesAt)}, with stock estimated to arrive ${formatDay(campaign.estimatedArrival)}. Supplied by ASCEND in Malaysia for laboratory research use only.`,
  };
}

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params;
  const campaign = await getCampaignServer(id);
  if (!campaign) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/kits"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Kits
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <span className="inline-flex items-center gap-1.5 text-xs text-text-muted font-medium uppercase tracking-wider">
          <CalendarClock className="w-3.5 h-3.5" /> Pre-order campaign
        </span>
        <h1 className="font-display text-3xl font-bold mt-2 mb-4">{campaign.name}</h1>

        <dl className="grid sm:grid-cols-3 gap-4 bg-surface rounded-xl border border-border p-5 mb-10">
          <div>
            <dt className="text-xs text-text-muted uppercase tracking-wider">Opened</dt>
            <dd className="text-text-secondary text-sm mt-0.5">{formatDay(campaign.opensAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted uppercase tracking-wider">Orders close</dt>
            <dd className="text-text-secondary text-sm mt-0.5">{formatDay(campaign.closesAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted uppercase tracking-wider">Estimated arrival</dt>
            <dd className="text-text-secondary text-sm mt-0.5">
              {formatDay(campaign.estimatedArrival)}
            </dd>
          </div>
        </dl>
      </Animate>

      {campaign.kits.length > 0 && (
        <section className="mb-10">
          <Animate variant="fadeUp" delay={0.1}>
            <h2 className="font-display text-xl font-bold mb-4">Kits in this campaign</h2>
          </Animate>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" stagger={0.06}>
            {campaign.kits.map((kit) => (
              <KitCard key={kit.id} kit={kit} />
            ))}
          </Stagger>
        </section>
      )}

      {campaign.batches.length > 0 && (
        <Animate variant="fadeUp" delay={0.15}>
          <section>
            <h2 className="font-display text-xl font-bold mb-1">Arriving in this batch</h2>
            <p className="text-sm text-text-secondary mb-4">
              What this campaign is bringing in. Each line is a separate lot with its own
              certificate of analysis and expiry.
            </p>
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              {/* Wide on mobile — let the table scroll inside its own box rather
                  than forcing the page body to scroll sideways. */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-elevated">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium text-text-secondary">Product</th>
                      <th className="px-4 py-3 font-medium text-text-secondary">Size</th>
                      <th className="px-4 py-3 font-medium text-text-secondary text-right">
                        Quantity
                      </th>
                      <th className="px-4 py-3 font-medium text-text-secondary">Expiry</th>
                      <th className="px-4 py-3 font-medium text-text-secondary">COA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaign.batches.map((batch) => (
                      <tr key={batch.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${batch.variant.product.slug}`}
                            className="font-medium hover:text-primary-light transition-colors"
                          >
                            {batch.variant.product.name}
                          </Link>
                          <span className="block text-xs text-text-muted">
                            {batch.variant.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {batch.variant.size ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-text-secondary">
                          {batch.quantity}
                        </td>
                        <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                          {formatDay(batch.expiry)}
                        </td>
                        <td className="px-4 py-3">
                          {batch.coaUrl ? (
                            <a
                              href={batch.coaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary-light hover:underline"
                            >
                              <FileCheck2 className="w-4 h-4" /> View
                            </a>
                          ) : (
                            <span className="text-text-muted">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </Animate>
      )}
    </div>
  );
}
