import type { FastifyInstance } from 'fastify';
import { getVariantDisplayName } from '../../utils/product-addons.js';

export async function getDashboardStats(fastify: FastifyInstance) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    todayOrders,
    todayRevenue,
    totalProducts,
    lowStockProducts,
    ordersByStatus,
    recentOrders,
    failedEmails,
  ] = await Promise.all([
    fastify.prisma.order.count({ where: { createdAt: { gte: today }, deletedAt: null } }),

    // Order.paymentStatus is gone — Payment now belongs to Invoice, not
    // Order (see the ERD's shipment/invoice decoupling), so "today's revenue"
    // is redefined as actual cash collected today (sum of Payment.amount by
    // paidAt), not the total of orders merely *placed* today. For a
    // credit-terms business this is the more honest number: an order placed
    // today under NET30 contributes nothing to revenue today.
    fastify.prisma.payment.aggregate({
      where: { paidAt: { gte: today } },
      _sum: { amount: true },
    }),

    fastify.prisma.product.count({ where: { active: true } }),

    // Legacy flat-stock threshold — a batch/campaign-driven variant's real
    // availability lives in Batch rows, not this field, so this only catches
    // the "simple always-available SKU" half of the catalog. Judgment call:
    // flagged for review rather than building a batch-aware low-stock query
    // here (out of this rework's scope).
    fastify.prisma.productVariant.findMany({
      where: { active: true, stock: { lt: 5 }, product: { active: true } },
      select: { id: true, code: true, size: true, stock: true, product: { select: { name: true } } },
      orderBy: { stock: 'asc' },
    }),

    fastify.prisma.order.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: true,
    }),

    fastify.prisma.order.findMany({
      where: { deletedAt: null },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { name: true } },
        items: { include: { variant: { select: { code: true, size: true, product: { select: { name: true } } } }, kit: { select: { name: true } } } },
      },
    }),

    fastify.prisma.emailOutbox.count({ where: { status: 'FAILED' } }),
  ]);

  return {
    todayOrders,
    todayRevenue: todayRevenue._sum.amount || 0,
    totalProducts,
    lowStockProducts: lowStockProducts.map((v) => ({
      id: v.id, code: v.code, name: getVariantDisplayName(v.product, v), stock: v.stock,
    })),
    ordersByStatus: Object.fromEntries(ordersByStatus.map((o) => [o.status, o._count])),
    recentOrders,
    failedEmails,
  };
}

export async function getAnalytics(fastify: FastifyInstance, query: { days?: string }) {
  const parsedDays = parseInt(query.days ?? '30', 10);
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 365) : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  // Order volume/sales and cash-collected are now genuinely decoupled (a
  // credit-terms order is a real sale today even though nothing's been paid
  // yet, and a payment recorded today can be against an invoice covering
  // shipments from orders placed weeks ago) — see the ERD's shipment/invoice
  // decoupling notes. This rework reports both halves separately instead of
  // forcing them back into one "paid order" concept the schema no longer has.
  const [orders, payments] = await Promise.all([
    fastify.prisma.order.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: {
        id: true,
        total: true,
        subtotal: true,
        discountAmount: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            variantId: true, kitId: true, quantity: true, unitPrice: true,
            variant: { select: { code: true, size: true, product: { select: { name: true, categoryId: true } } } },
            kit: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    fastify.prisma.payment.findMany({
      where: { paidAt: { gte: since } },
      select: { amount: true, method: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    }),
  ]);

  const dailyRevenue: Record<string, { date: string; revenue: number; orders: number }> = {};
  for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    dailyRevenue[key] = { date: key, revenue: 0, orders: 0 };
  }

  const productSales: Record<string, { name: string; code: string | null; quantity: number; revenue: number }> = {};
  let totalOrders = 0;
  let cancelledOrders = 0;
  let completedOrders = 0;
  const statusCounts: Record<string, number> = {};

  for (const order of orders) {
    const dayKey = order.createdAt.toISOString().slice(0, 10);
    if (dailyRevenue[dayKey]) dailyRevenue[dayKey].orders++;

    totalOrders++;
    if (order.status === 'CANCELLED') cancelledOrders++;
    if (order.status === 'COMPLETE') completedOrders++;
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

    // Sales volume counts every non-cancelled order regardless of payment
    // status — credit-terms orders are real sales the moment they're placed.
    if (order.status !== 'CANCELLED') {
      for (const item of order.items) {
        const key = item.variantId ?? `kit:${item.kitId}`;
        if (!productSales[key]) {
          const name = item.variant ? getVariantDisplayName(item.variant.product, item.variant) : (item.kit?.name ?? 'Kit');
          productSales[key] = { name, code: item.variant?.code ?? null, quantity: 0, revenue: 0 };
        }
        productSales[key].quantity += item.quantity;
        productSales[key].revenue += item.unitPrice * item.quantity;
      }
    }
  }

  let totalRevenue = 0;
  const paymentMethodCounts: Record<string, number> = {};
  for (const payment of payments) {
    totalRevenue += payment.amount;
    paymentMethodCounts[payment.method] = (paymentMethodCounts[payment.method] || 0) + 1;
    const dayKey = payment.paidAt.toISOString().slice(0, 10);
    if (dailyRevenue[dayKey]) dailyRevenue[dayKey].revenue += payment.amount;
  }

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const avgOrderValue = totalOrders > 0 ? Math.round(orders.reduce((s, o) => s + o.total, 0) / totalOrders) : 0;

  return {
    period: { days, since: since.toISOString() },
    summary: {
      totalRevenue, // cash actually collected (Payment.amount) in the period
      totalOrders, // orders placed in the period, regardless of payment
      completedOrders,
      cancelledOrders,
      avgOrderValue, // based on order.total, not payment
    },
    dailyRevenue: Object.values(dailyRevenue),
    topProducts,
    paymentMethods: paymentMethodCounts,
    orderStatuses: statusCounts,
  };
}
