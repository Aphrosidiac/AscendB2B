// Populates the B2B-specific data the base seed.ts doesn't touch: price
// tiers, MOQ, a preorder campaign, batches, and kits. Safe to re-run
// (upserts/findFirst-guards throughout) — run after seed.ts against a DB
// that already has the base catalog.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function variantId(code: string): Promise<string> {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { code } });
  return v.id;
}

async function main() {
  const ghkCu50 = await variantId('CU50');
  const ghkCu100 = await variantId('CU100');
  const reta10 = await variantId('RETA10');
  const reta20 = await variantId('RETA20');
  const reta30 = await variantId('RETA30');
  const tesa10 = await variantId('TESA10');
  const hgh36 = await variantId('H36');
  const aceticAcid = await variantId('AA10');

  // MOQ — bulk-only framing on a few flagship/consumable SKUs.
  await prisma.productVariant.update({ where: { id: ghkCu50 }, data: { moq: 5 } });
  await prisma.productVariant.update({ where: { id: reta10 }, data: { moq: 5 } });
  await prisma.productVariant.update({ where: { id: tesa10 }, data: { moq: 3 } });
  await prisma.productVariant.update({ where: { id: aceticAcid }, data: { moq: 10 } });

  // Price tiers (unitPrice in sen, minQty ascending).
  const tiers: Array<{ variantId: string; minQty: number; unitPrice: number }> = [
    { variantId: ghkCu50, minQty: 10, unitPrice: 9000 },
    { variantId: ghkCu50, minQty: 50, unitPrice: 8000 },
    { variantId: ghkCu50, minQty: 100, unitPrice: 7000 },
    { variantId: ghkCu100, minQty: 10, unitPrice: 11500 },
    { variantId: ghkCu100, minQty: 50, unitPrice: 10000 },
    { variantId: reta10, minQty: 10, unitPrice: 12000 },
    { variantId: reta10, minQty: 25, unitPrice: 10500 },
    { variantId: reta20, minQty: 10, unitPrice: 17000 },
    { variantId: reta20, minQty: 25, unitPrice: 15000 },
    { variantId: tesa10, minQty: 10, unitPrice: 11000 },
    { variantId: tesa10, minQty: 25, unitPrice: 9500 },
    { variantId: hgh36, minQty: 5, unitPrice: 19000 },
    { variantId: hgh36, minQty: 15, unitPrice: 17000 },
    { variantId: aceticAcid, minQty: 20, unitPrice: 2000 },
    { variantId: aceticAcid, minQty: 50, unitPrice: 1600 },
  ];
  for (const t of tiers) {
    await prisma.priceTier.upsert({
      where: { variantId_minQty: { variantId: t.variantId, minQty: t.minQty } },
      update: { unitPrice: t.unitPrice },
      create: t,
    });
  }

  // One open preorder campaign for an incoming restock.
  const now = new Date();
  const campaign = await prisma.preorderCampaign.upsert({
    where: { id: 'demo-campaign-2608-restock' },
    update: {},
    create: {
      id: 'demo-campaign-2608-restock',
      name: 'August 2026 Retatrutide & Tesamorelin Restock',
      opensAt: now,
      closesAt: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000),
      estimatedArrival: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    },
  });

  // Batches — a couple of standalone in-stock lots, plus a few tied to the
  // campaign (incoming, not yet arrived). coaUrl intentionally left null for
  // this demo data — a real COA link shouldn't be fabricated for a lot that
  // was never actually lab-tested.
  const batches: Array<{ id: string; variantId: string; campaignId: string | null; batchNumber: string; quantity: number; status: 'IN_STOCK' | 'INCOMING' }> = [
    { id: 'demo-batch-ghkcu50-a', variantId: ghkCu50, campaignId: null, batchNumber: 'GHKCU50-2607-A', quantity: 200, status: 'IN_STOCK' },
    { id: 'demo-batch-hgh36-a', variantId: hgh36, campaignId: null, batchNumber: 'HGHH36-2607-A', quantity: 80, status: 'IN_STOCK' },
    { id: 'demo-batch-reta10-camp', variantId: reta10, campaignId: campaign.id, batchNumber: 'RETA10-2608-CAMP', quantity: 150, status: 'INCOMING' },
    { id: 'demo-batch-reta20-camp', variantId: reta20, campaignId: campaign.id, batchNumber: 'RETA20-2608-CAMP', quantity: 100, status: 'INCOMING' },
    { id: 'demo-batch-tesa10-camp', variantId: tesa10, campaignId: campaign.id, batchNumber: 'TESA10-2608-CAMP', quantity: 120, status: 'INCOMING' },
  ];
  const expiry = new Date(now.getTime() + 18 * 30 * 24 * 60 * 60 * 1000);
  for (const b of batches) {
    await prisma.batch.upsert({
      where: { id: b.id },
      update: { quantity: b.quantity, status: b.status },
      create: { id: b.id, variantId: b.variantId, campaignId: b.campaignId, batchNumber: b.batchNumber, expiry, quantity: b.quantity, status: b.status },
    });
  }

  // Kits — bundles priced below the sum of their components.
  const skinKit = await prisma.kit.upsert({
    where: { id: 'demo-kit-skin-repair-starter' },
    update: {},
    create: { id: 'demo-kit-skin-repair-starter', name: 'Skin Repair Starter Kit', pricePerKit: 17000, qtyPerKit: 1 },
  });
  await prisma.kitItem.deleteMany({ where: { kitId: skinKit.id } });
  await prisma.kitItem.createMany({
    data: [
      { kitId: skinKit.id, variantId: ghkCu50, quantity: 2 },
      { kitId: skinKit.id, variantId: aceticAcid, quantity: 1 },
    ],
  });

  const retaKit = await prisma.kit.upsert({
    where: { id: 'demo-kit-reta-full-course' },
    update: { campaignId: campaign.id },
    create: { id: 'demo-kit-reta-full-course', name: 'Retatrutide Full Course Kit', pricePerKit: 48000, qtyPerKit: 1, campaignId: campaign.id },
  });
  await prisma.kitItem.deleteMany({ where: { kitId: retaKit.id } });
  await prisma.kitItem.createMany({
    data: [
      { kitId: retaKit.id, variantId: reta10, quantity: 1 },
      { kitId: retaKit.id, variantId: reta20, quantity: 1 },
      { kitId: retaKit.id, variantId: reta30, quantity: 1 },
    ],
  });

  console.log(`B2B demo data seeded: ${tiers.length} price tiers, MOQ set on 4 variants, 1 campaign, ${batches.length} batches, 2 kits`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
