import { formatPrice } from '@/lib/utils';
import type { PriceTier } from '@/types';

interface Props {
  priceTiers: PriceTier[];
  /** Unit price for quantities below the first tier's minQty (the variant's own effective price). */
  basePrice: number;
}

// Quantity-break pricing table shown on the PDP — B2B bulk pricing, ordered
// by minQty ascending (see docs/erd-b2b.md PRICE_TIER). Each row's range is
// open-ended until the next tier kicks in.
export function PriceTierTable({ priceTiers, basePrice }: Props) {
  if (!priceTiers || priceTiers.length === 0) return null;

  const sorted = [...priceTiers].sort((a, b) => a.minQty - b.minQty);
  const showBaseRow = sorted[0].minQty > 1;
  const best = sorted[sorted.length - 1];
  // The saving is the reason this table exists — state it outright rather
  // than making the buyer diff two numbers in their head.
  const savingPct = Math.round(((basePrice - best.unitPrice) / basePrice) * 100);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-elevated border-b border-border">
          <tr>
            <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Quantity</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Unit Price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {showBaseRow && (
            <tr>
              <td className="px-3 py-2.5 text-text-secondary">1 – {sorted[0].minQty - 1}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatPrice(basePrice)}</td>
            </tr>
          )}
          {sorted.map((tier, i) => {
            const next = sorted[i + 1];
            const isBest = !next;
            return (
              <tr key={tier.id} className={isBest ? 'bg-primary text-white' : undefined}>
                <td className={`px-3 py-2.5 ${isBest ? 'font-medium' : 'text-text-secondary'}`}>
                  {tier.minQty}{next ? ` – ${next.minQty - 1}` : '+'}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatPrice(tier.unitPrice)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {savingPct > 0 && (
        <p className="px-3 py-2 text-xs text-text-secondary bg-surface-elevated border-t border-border">
          Save {savingPct}% per unit at {best.minQty}+
        </p>
      )}
    </div>
  );
}
