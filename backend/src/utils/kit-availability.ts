import type { Prisma, PrismaClient } from '@prisma/client';

// A kit's components are drawn from batches where the catalog tracks them,
// and from the flat ProductVariant.stock field where it doesn't — the
// catalog is deliberately mixed (some SKUs are campaign/batch-driven, some
// are simple always-available items). Both the storefront's "how many can I
// buy" number and order creation's stock check must agree on this, so the
// statuses and the fallback rule live here rather than in either caller.
export const BATCH_SELLABLE_STATUSES = ['IN_STOCK', 'INCOMING'] as const;

// A kit is offerable to customers when it's active AND either standalone or
// attached to a campaign that's currently OPEN. A DRAFT campaign hasn't been
// announced, and CLOSED/SOLD_OUT ones are past their window — in neither case
// may their kits be browsed or ordered.
//
// This is the single source of truth for that rule: the public kit endpoints
// filter listings with it, and createOrder re-applies it server-side so a kit
// id lifted from an open campaign stays unorderable once that campaign shuts.
// Keep them using this same constant — a public listing that hides a kit the
// order endpoint would still accept is exactly the gap this prevents.
export const PUBLIC_KIT_WHERE = {
  active: true,
  OR: [{ campaignId: null }, { campaign: { status: 'OPEN' as const } }],
} satisfies Prisma.KitWhereInput;

type KitWithItems = { id: string; items: { variantId: string; quantity: number }[] };

type TxClient = PrismaClient | Prisma.TransactionClient;

/**
 * How many whole units of each kit could be assembled right now, keyed by kit
 * id. A kit is gated by its scarcest component: three vials needed and only
 * five in stock means one buildable kit, not five.
 *
 * Mirrors createOrder's per-component stock check exactly, so the number shown
 * on a kit page is the same number checkout will enforce. Returns 0 for a kit
 * with no components rather than Infinity — an empty kit is not sellable.
 */
export async function getKitAvailability(
  tx: TxClient,
  kits: KitWithItems[]
): Promise<Map<string, number>> {
  const variantIds = [...new Set(kits.flatMap((k) => k.items.map((i) => i.variantId)))];
  if (variantIds.length === 0) {
    return new Map(kits.map((k) => [k.id, 0]));
  }

  const [batchSums, variants] = await Promise.all([
    tx.batch.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds }, status: { in: [...BATCH_SELLABLE_STATUSES] } },
      _sum: { quantity: true },
    }),
    tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, stock: true, active: true },
    }),
  ]);

  const batchTotals = new Map(batchSums.map((b) => [b.variantId, b._sum.quantity ?? 0]));
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  function available(variantId: string): number {
    // Only a variant with no sellable batch rows at all falls back to the flat
    // stock column; one that has them is fully batch-driven.
    if (batchTotals.has(variantId)) return batchTotals.get(variantId)!;
    const variant = variantMap.get(variantId);
    // A component whose variant was deactivated or deleted makes the whole kit
    // unbuildable — treat it as zero rather than skipping it, or the kit would
    // advertise stock it can't actually ship.
    if (!variant || !variant.active) return 0;
    return variant.stock;
  }

  return new Map(
    kits.map((kit) => {
      if (kit.items.length === 0) return [kit.id, 0] as const;
      const buildable = Math.min(
        ...kit.items.map((item) => Math.floor(available(item.variantId) / item.quantity))
      );
      return [kit.id, Math.max(0, buildable)] as const;
    })
  );
}
