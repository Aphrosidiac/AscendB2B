/**
 * Test-data seeder for the AscendB2B **production** database.
 *
 * Run explicitly, never from `postinstall` or `prisma db seed`:
 *   npx tsx prisma/seed-testdata.ts
 *
 * Everything it writes is prefixed `seed-` (ids) / `seed_` (usernames,
 * batch and document numbers) so it is re-runnable and, more importantly,
 * so the rows are trivially identifiable and removable later:
 *
 *   DELETE FROM orders   WHERE id LIKE 'seed-%';
 *   DELETE FROM companies WHERE id LIKE 'seed-%';
 *
 * It does NOT touch existing companies, orders, products or the existing
 * admin user — it only adds. The one shared credential below is applied to
 * the seeded companies and the seeded admin only.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

// Same driver-adapter construction as src/plugins/prisma.ts and prisma/seed.ts
// — Prisma 7 has no built-in engine to fall back on.
const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Handed to Fakhrul; not used by any real account.
const PASSWORD = 'AscendTest2026!';
const ADMIN_EMAIL = 'testadmin@ascend.my';

const day = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(Date.now() - d * day);
const ahead = (d: number) => new Date(Date.now() + d * day);

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  // ---- admin -------------------------------------------------------------
  // Added alongside the existing admin@ascend.my rather than resetting it,
  // so whatever password is already in use keeps working.
  await prisma.adminUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: hash },
    create: { id: 'seed-admin', email: ADMIN_EMAIL, passwordHash: hash, name: 'Test Admin' },
  });

  // ---- companies ---------------------------------------------------------
  // Chosen to cover the credit-terms ladder that production was missing
  // (NET15 / NET60) plus a profile-incomplete account, which is the state
  // the admin banner and username fallback exist for.
  const companySpecs = [
    {
      id: 'seed-co-net15', username: 'seed_meridian', email: 'seed.meridian@example.test',
      name: 'Meridian Clinical Supplies Sdn Bhd', contactName: 'Nurul Hisham', phone: '0123456701',
      taxId: 'C21458800-01', creditTerms: 'NET15' as const,
    },
    {
      id: 'seed-co-net60', username: 'seed_verdant', email: 'seed.verdant@example.test',
      name: 'Verdant Biolabs Sdn Bhd', contactName: 'Chan Wei Ming', phone: '0123456702',
      taxId: 'C21458800-02', creditTerms: 'NET60' as const,
    },
    {
      id: 'seed-co-prepaid', username: 'seed_northgate', email: 'seed.northgate@example.test',
      name: 'Northgate Pharmacy Group', contactName: 'Farah Idris', phone: '0123456703',
      taxId: null, creditTerms: 'PREPAID' as const,
    },
    {
      // Deliberately null name/contactName/phone: blocked from ordering by
      // assertProfileComplete, and the case admin's "profile incomplete"
      // banner + companyLabel() username fallback were built for.
      id: 'seed-co-incomplete', username: 'seed_newsignup', email: 'seed.newsignup@example.test',
      name: null, contactName: null, phone: null, taxId: null, creditTerms: 'PREPAID' as const,
    },
  ];

  for (const c of companySpecs) {
    const { id, ...rest } = c;
    await prisma.company.upsert({
      where: { id },
      update: { ...rest, passwordHash: hash },
      create: { id, ...rest, passwordHash: hash, createdAt: ago(40) },
    });
  }

  // Every company that can order needs a shipping address (Order requires one).
  for (const c of companySpecs.filter((c) => c.name)) {
    await prisma.companyAddress.upsert({
      where: { id: `seed-addr-${c.id}` },
      update: {},
      create: {
        id: `seed-addr-${c.id}`, companyId: c.id, label: 'Main warehouse',
        line1: 'Lot 12, Jalan Perindustrian 3', line2: 'Taman Perindustrian Puchong',
        city: 'Puchong', state: 'Selangor', postcode: '47100', type: 'SHIPPING',
      },
    });
  }

  // ---- source real variants/batches so orders reference live catalogue ----
  const variants = await prisma.productVariant.findMany({
    where: { active: true }, select: { id: true, code: true, price: true }, orderBy: { code: 'asc' }, take: 6,
  });
  const batches = await prisma.batch.findMany({
    where: { status: { in: ['IN_STOCK', 'INCOMING'] } }, select: { id: true, variantId: true },
  });
  if (variants.length === 0) throw new Error('no active variants — nothing to build orders from');

  const batchFor = (variantId: string) => batches.find((b) => b.variantId === variantId)?.id ?? batches[0]?.id;

  // ---- orders across the status ladder -----------------------------------
  const orderSpecs = [
    { n: 1, co: 'seed-co-net15',   status: 'PENDING'   as const, daysAgo: 1,  ship: false },
    { n: 2, co: 'seed-co-net15',   status: 'CONFIRMED' as const, daysAgo: 4,  ship: false },
    { n: 3, co: 'seed-co-net60',   status: 'PACKING'   as const, daysAgo: 7,  ship: false },
    { n: 4, co: 'seed-co-net60',   status: 'SHIPPED'   as const, daysAgo: 12, ship: true  },
    { n: 5, co: 'seed-co-prepaid', status: 'DELIVERED' as const, daysAgo: 20, ship: true  },
    { n: 6, co: 'seed-co-net15',   status: 'COMPLETE'  as const, daysAgo: 30, ship: true  },
    { n: 7, co: 'seed-co-prepaid', status: 'CANCELLED' as const, daysAgo: 25, ship: false },
  ];

  const shipped: { orderId: string; companyId: string; n: number; daysAgo: number }[] = [];

  for (const o of orderSpecs) {
    const id = `seed-order-${o.n}`;
    const picks = variants.slice((o.n - 1) % 3, ((o.n - 1) % 3) + 2);
    const items = picks.map((v, i) => ({
      id: `seed-oi-${o.n}-${i}`, variantId: v.id, quantity: 5 * (i + 2), unitPrice: v.price,
    }));
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    await prisma.order.upsert({
      where: { id },
      update: {},
      create: {
        id,
        orderNumber: `SEED${String(o.n).padStart(4, '0')}`,
        companyId: o.co,
        shippingAddressId: `seed-addr-${o.co}`,
        subtotal, shippingFee: 0, discountAmount: 0, total: subtotal,
        status: o.status,
        createdAt: ago(o.daysAgo),
        items: { create: items },
      },
    });

    if (o.ship) shipped.push({ orderId: id, companyId: o.co, n: o.n, daysAgo: o.daysAgo });
  }

  // ---- shipments for the shipped/delivered/complete orders ---------------
  for (const s of shipped) {
    const orderItems = await prisma.orderItem.findMany({ where: { orderId: s.orderId } });
    const shipmentId = `seed-ship-${s.n}`;
    await prisma.shipment.upsert({
      where: { id: shipmentId },
      update: {},
      create: {
        id: shipmentId, orderId: s.orderId, shipmentNumber: `SEEDSHP${String(s.n).padStart(4, '0')}`,
        shippedAt: ago(s.daysAgo - 2), carrier: 'J&T Express',
        trackingNumber: `JT${900000000 + s.n}`, createdAt: ago(s.daysAgo - 2),
        items: {
          create: orderItems.map((oi, i) => ({
            id: `seed-si-${s.n}-${i}`, orderItemId: oi.id,
            batchId: batchFor(oi.variantId!)!, quantity: oi.quantity,
          })),
        },
      },
    });
  }

  // ---- invoices: paid / partially paid / overdue -------------------------
  // Status is never stored — it is derived from SUM(payments) vs total and
  // dueDate vs now (computeInvoiceStatus). These three shapes therefore
  // produce Paid, Partially Paid and Overdue purely from the data below.
  const invoicePlans = [
    { n: 1, shipIdx: 0, dueInDays: 15,  payFraction: 1.0 },  // Paid
    { n: 2, shipIdx: 1, dueInDays: 10,  payFraction: 0.4 },  // Partially Paid
    { n: 3, shipIdx: 2, dueInDays: -12, payFraction: 0   },  // Overdue
  ];

  for (const p of invoicePlans) {
    const s = shipped[p.shipIdx];
    if (!s) continue;
    const shipmentItems = await prisma.shipmentItem.findMany({
      where: { shipmentId: `seed-ship-${s.n}` },
      include: { orderItem: true },
    });
    if (shipmentItems.length === 0) continue;

    const total = shipmentItems.reduce((sum, si) => sum + si.quantity * si.orderItem.unitPrice, 0);
    const invoiceId = `seed-inv-${p.n}`;

    await prisma.invoice.upsert({
      where: { id: invoiceId },
      update: {},
      create: {
        id: invoiceId,
        invoiceNumber: `SEEDINV${String(p.n).padStart(4, '0')}`,
        companyId: s.companyId,
        issueDate: ago(Math.max(1, s.daysAgo - 3)),
        dueDate: p.dueInDays >= 0 ? ahead(p.dueInDays) : ago(-p.dueInDays),
        total,
        items: {
          create: shipmentItems.map((si, i) => ({
            id: `seed-ii-${p.n}-${i}`, shipmentItemId: si.id,
            amount: si.quantity * si.orderItem.unitPrice,
          })),
        },
      },
    });

    if (p.payFraction > 0) {
      const amount = Math.round(total * p.payFraction);
      await prisma.payment.upsert({
        where: { id: `seed-pay-${p.n}` },
        update: {},
        create: {
          id: `seed-pay-${p.n}`, invoiceId, amount, method: 'WHATSAPP',
          paymentRef: `Bank transfer slip #SEED${p.n}`, paidAt: ago(2),
        },
      });
    }
  }

  // ---- quotations: one open, one accepted, one expired -------------------
  const quotePlans = [
    { n: 1, co: 'seed-co-net15',   status: 'SENT'     as const, validDays: 14 },
    { n: 2, co: 'seed-co-net60',   status: 'ACCEPTED' as const, validDays: 20 },
    { n: 3, co: 'seed-co-prepaid', status: 'EXPIRED'  as const, validDays: -5 },
  ];

  for (const q of quotePlans) {
    const picks = variants.slice(0, 2);
    const items = picks.map((v, i) => ({
      id: `seed-qi-${q.n}-${i}`, variantId: v.id, quantity: 25 * (i + 1),
      unitPrice: Math.round(v.price * 0.9),
    }));
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    await prisma.quotation.upsert({
      where: { id: `seed-quote-${q.n}` },
      update: {},
      create: {
        id: `seed-quote-${q.n}`,
        quoteNumber: `SEEDQT${String(q.n).padStart(4, '0')}`,
        companyId: q.co,
        status: q.status,
        validUntil: q.validDays >= 0 ? ahead(q.validDays) : ago(-q.validDays),
        subtotal, total: subtotal,
        createdBy: 'seed',
        createdAt: ago(18),
        items: { create: items },
      },
    });
  }

  // ---- report ------------------------------------------------------------
  const counts = await prisma.$transaction([
    prisma.company.count(), prisma.order.count(), prisma.shipment.count(),
    prisma.invoice.count(), prisma.payment.count(), prisma.quotation.count(),
  ]);
  console.log(JSON.stringify({
    companies: counts[0], orders: counts[1], shipments: counts[2],
    invoices: counts[3], payments: counts[4], quotations: counts[5],
  }));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
