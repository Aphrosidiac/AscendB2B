import Link from 'next/link';
import { Package, CalendarClock, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { getKitsServer, getCampaignsServer } from '@/lib/server-api';
import { KitCard } from '@/components/kits/KitCard';
import { Animate, Stagger } from '@/components/ui/Animate';

export const metadata: Metadata = {
  title: 'Kits & Pre-Orders | ASCEND',
  description:
    'Pre-assembled research kits and open pre-order campaigns for trade buyers — fixed price per kit, with component quantities and expected arrival dates listed up front.',
};

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function KitsPage() {
  const [kits, campaigns] = await Promise.all([
    getKitsServer({ limit: 100 }),
    getCampaignsServer({ limit: 50 }),
  ]);

  const hasKits = kits.data.length > 0;
  const openCampaigns = campaigns.data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Animate variant="fadeUp" duration={0.5}>
        <h1 className="font-display text-3xl font-bold mb-3">Kits &amp; Pre-Orders</h1>
        <p className="text-text-secondary max-w-2xl mb-8">
          Pre-assembled kits at a fixed price per kit, and open pre-order campaigns for stock
          arriving on a known date. Every kit lists exactly what it contains and how many units of
          each — no substitutions.
        </p>
      </Animate>

      {openCampaigns.length > 0 && (
        <Animate variant="fadeUp" delay={0.1}>
          <section className="mb-10">
            <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-text-muted" />
              Open pre-order campaigns
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {openCampaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="group bg-surface rounded-xl border border-border hover:border-border-hover hover:shadow-md transition-all duration-300 p-5 block"
                >
                  <h3 className="font-display font-bold group-hover:text-primary-light transition-colors">
                    {campaign.name}
                  </h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-text-muted uppercase tracking-wider">Closes</dt>
                      <dd className="text-text-secondary">{formatDay(campaign.closesAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted uppercase tracking-wider">
                        Est. arrival
                      </dt>
                      <dd className="text-text-secondary">
                        {formatDay(campaign.estimatedArrival)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm text-text-muted">
                    {campaign.kits.length} {campaign.kits.length === 1 ? 'kit' : 'kits'} &middot;{' '}
                    {campaign.batches.length}{' '}
                    {campaign.batches.length === 1 ? 'line' : 'lines'} arriving
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-light">
                    View campaign <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </Animate>
      )}

      <section>
        {openCampaigns.length > 0 && (
          <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-text-muted" />
            All kits
          </h2>
        )}

        {hasKits ? (
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" stagger={0.06}>
            {kits.data.map((kit) => (
              <KitCard key={kit.id} kit={kit} />
            ))}
          </Stagger>
        ) : (
          <Animate variant="scale" duration={0.5}>
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <h2 className="font-display text-xl font-bold mb-2">No kits available right now</h2>
              <p className="text-text-secondary mb-6">
                Kits are published alongside pre-order campaigns. In the meantime, the full
                catalogue is open for bulk ordering.
              </p>
              <Link
                href="/products"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-light"
              >
                Browse the catalogue <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </Animate>
        )}
      </section>
    </div>
  );
}
