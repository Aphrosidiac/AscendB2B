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

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-elevated">
          <tr>
            <th className="text-left px-3 py-2 font-semibold text-text-secondary">Quantity</th>
            <th className="text-right px-3 py-2 font-semibold text-text-secondary">Unit Price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {showBaseRow && (
            <tr>
              <td className="px-3 py-2 text-text-secondary">1 – {sorted[0].minQty - 1}</td>
              <td className="px-3 py-2 text-right font-medium">{formatPrice(basePrice)}</td>
            </tr>
          )}
          {sorted.map((tier, i) => {
            const next = sorted[i + 1];
            return (
              <tr key={tier.id}>
                <td className="px-3 py-2 text-text-secondary">
                  {tier.minQty}{next ? ` – ${next.minQty - 1}` : '+'}
                </td>
                <td className="px-3 py-2 text-right font-medium">{formatPrice(tier.unitPrice)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
