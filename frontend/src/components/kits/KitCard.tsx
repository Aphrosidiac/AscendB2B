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
  // Component thumbnails double as the card's visual — a kit has no image of
  // its own, and showing what's inside is more useful than a generic icon.
  const thumbnails = kit.items.filter((i) => i.variant.imageUrl).slice(0, 3);

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

        <p className="text-sm text-text-secondary mt-1">
          {kit.items.length} {kit.items.length === 1 ? 'product' : 'products'} per kit
        </p>

        {thumbnails.length > 0 && (
          <div className="flex -space-x-2 mt-3">
            {thumbnails.map((item) => (
              <div
                key={item.id}
                className="w-9 h-9 rounded-lg border-2 border-surface bg-surface-elevated overflow-hidden shrink-0"
              >
                <img
                  src={item.variant.imageUrl!}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {kit.items.length > thumbnails.length && (
              <div className="w-9 h-9 rounded-lg border-2 border-surface bg-surface-elevated flex items-center justify-center shrink-0">
                <span className="text-[10px] font-semibold text-text-muted">
                  +{kit.items.length - thumbnails.length}
                </span>
              </div>
            )}
          </div>
        )}

        <ul className="mt-3 space-y-0.5">
          {kit.items.slice(0, 3).map((item) => (
            <li key={item.id} className="text-xs text-text-muted truncate">
              {item.quantity}&times; {item.variant.product.name}
              {item.variant.size ? ` ${item.variant.size}` : ''}
            </li>
          ))}
          {kit.items.length > 3 && (
            <li className="text-xs text-text-muted">+{kit.items.length - 3} more</li>
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
