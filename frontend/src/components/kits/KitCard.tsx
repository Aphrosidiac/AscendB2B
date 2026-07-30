'use client';

import Link from 'next/link';
import { Package, Clock } from 'lucide-react';
import type { PublicKit } from '@/types';
import { formatPrice } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

interface KitCardProps {
  kit: PublicKit;
}

export function KitCard({ kit }: KitCardProps) {
  const soldOut = kit.available === 0;
  // No thumbnails: the storefront is picture-free, and a kit's contents list
  // says more than three near-identical vial photos ever did.
  const totalUnits = kit.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Link href={`/kits/${kit.id}`} className="group h-full block">
      <div className="bg-surface rounded-xl border border-border hover:border-border-hover hover:shadow-md hover:-translate-y-1 transition-all duration-300 p-5 h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted font-medium uppercase tracking-wider">
            <Package className="w-3.5 h-3.5" /> Kit
          </span>
          {kit.campaign && <Badge className="bg-orange-100 text-orange-800">Pre-order</Badge>}
        </div>

        <h3 className="font-display font-bold text-base group-hover:text-primary-light transition-colors">
          {kit.name}
        </h3>

        <p className="text-sm text-text-secondary mt-1 tabular-nums">
          {kit.items.length} {kit.items.length === 1 ? 'SKU' : 'SKUs'} &middot; {totalUnits}{' '}
          {totalUnits === 1 ? 'unit' : 'units'} per kit
        </p>

        {/* The contents ARE the card. Code first, matching how every other
            list on the site identifies a SKU. */}
        <ul className="mt-3 space-y-1">
          {kit.items.slice(0, 4).map((item) => (
            <li key={item.id} className="flex items-baseline gap-2 text-xs">
              <span className="font-display font-bold tracking-wide text-text-secondary shrink-0">
                {item.variant.code}
              </span>
              <span className="text-text-muted truncate">
                {item.variant.product.name}
                {item.variant.size ? ` ${item.variant.size}` : ''}
              </span>
              <span className="ml-auto text-text-muted tabular-nums shrink-0">
                &times;{item.quantity}
              </span>
            </li>
          ))}
          {kit.items.length > 4 && (
            <li className="text-xs text-text-muted">+{kit.items.length - 4} more</li>
          )}
        </ul>

        {kit.campaign && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Arrives {new Date(kit.campaign.estimatedArrival).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}
            </span>
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 mt-auto">
          <span className="flex flex-col min-w-0">
            <span className="font-display font-bold text-lg">{formatPrice(kit.pricePerKit)}</span>
            <span className="text-xs text-text-muted leading-tight">per kit</span>
          </span>
          {soldOut ? (
            <span className="text-xs font-semibold text-danger shrink-0">Sold out</span>
          ) : (
            <span className="text-xs text-text-muted shrink-0">{kit.available} available</span>
          )}
        </div>
      </div>
    </Link>
  );
}
