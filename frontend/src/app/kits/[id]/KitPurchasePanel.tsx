'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { getKit } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/utils';
import type { PublicKit } from '@/types';

interface Props {
  kit: PublicKit;
}

export function KitPurchasePanel({ kit }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  // The page is server-rendered behind a cache window, and kit availability
  // also moves when unrelated orders ship (no revalidation ping fires for
  // that). Re-fetch once on mount so the stepper's ceiling reflects stock now
  // rather than stock whenever this HTML was generated.
  const [available, setAvailable] = useState(kit.available);
  const { addItem } = useCart();

  useEffect(() => {
    let cancelled = false;
    getKit(kit.id)
      .then((fresh) => {
        if (cancelled) return;
        setAvailable(fresh.available);
        // Clamped here rather than in an effect on `available` — a separate
        // effect would set state during render and cascade an extra pass.
        setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, fresh.available)));
      })
      // A failed refresh just leaves the SSR'd number in place — order
      // creation re-checks component stock server-side either way.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kit.id]);

  const soldOut = available === 0;

  const handleAddToCart = () => {
    addItem({
      kitId: kit.id,
      code: 'KIT',
      name: kit.name,
      size: null,
      price: kit.pricePerKit,
      quantity,
      stock: available,
      // Kits are priced flat per kit — no quantity breaks, so no priceTiers.
      imageUrl: kit.items.find((i) => i.variant.imageUrl)?.variant.imageUrl ?? null,
      kitContents: kit.items.map((i) => ({
        name: i.variant.product.name,
        size: i.variant.size,
        quantity: i.quantity,
      })),
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-display font-bold text-2xl">{formatPrice(kit.pricePerKit)}</span>
        <span className="text-sm text-text-muted">per kit</span>
      </div>

      <p className="text-sm text-text-secondary mb-4">
        {soldOut ? (
          <span className="text-danger font-medium">
            Sold out — not enough stock to assemble a kit
          </span>
        ) : (
          <>
            {available} {available === 1 ? 'kit' : 'kits'} available
          </>
        )}
      </p>

      {!soldOut && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-text-secondary">Quantity</span>
          <div className="flex items-center border border-border rounded-lg">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Decrease quantity"
            >
              -
            </button>
            <span className="px-4 py-1.5 text-sm font-medium">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(available, q + 1))}
              disabled={quantity >= available}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <span className="ml-auto font-display font-bold">
            {formatPrice(kit.pricePerKit * quantity)}
          </span>
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleAddToCart}
        disabled={soldOut}
        aria-label={`Add ${kit.name} to cart`}
      >
        {added ? (
          <>
            <Check className="w-4 h-4" /> Added to cart
          </>
        ) : (
          <>
            <ShoppingCart className="w-4 h-4" /> Add kit to cart
          </>
        )}
      </Button>

      <p className="text-xs text-text-muted mt-3 leading-relaxed">
        Kits ship as a single line. Availability is limited by the scarcest component and is
        re-checked at checkout.
      </p>
    </div>
  );
}
