import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { generateShipmentNumber } from '../../utils/shipment-number.js';

type TxOrClient = Prisma.TransactionClient;

const createShipmentSchema = z.object({
  orderId: z.string(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
});

export async function adminListShipments(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.orderId) where.orderId = query.orderId;

  const [shipments, total] = await Promise.all([
    fastify.prisma.shipment.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true, companyId: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.shipment.count({ where }),
  ]);

  return paginatedResponse(shipments, total, page, limit);
}

export async function adminGetShipment(fastify: FastifyInstance, id: string) {
  const shipment = await fastify.prisma.shipment.findUnique({
    where: { id },
    include: {
      order: { include: { company: { select: { name: true } } } },
      items: { include: { batch: true, orderItem: { include: { variant: { include: { product: true } }, kit: true } } } },
    },
  });
  if (!shipment) throw { statusCode: 404, message: 'Shipment not found' };
  return shipment;
}

export async function adminCreateShipment(fastify: FastifyInstance, body: unknown) {
  const data = createShipmentSchema.parse(body);

  const order = await fastify.prisma.order.findUnique({ where: { id: data.orderId } });
  if (!order || order.deletedAt) throw { statusCode: 404, message: 'Order not found' };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const shipmentNumber = await generateShipmentNumber(tx);
        return tx.shipment.create({
          data: {
            shipmentNumber,
            orderId: data.orderId,
            carrier: data.carrier,
            trackingNumber: data.trackingNumber,
          },
        });
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const meta = (err as { meta?: { target?: string | string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } })?.meta;
      const fields = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
      const conflict = Array.isArray(fields) ? fields.includes('shipmentNumber') : typeof fields === 'string' && fields.includes('shipmentNumber');
      if (code === 'P2002' && attempt < MAX_ATTEMPTS && conflict) continue;
      throw err;
    }
  }
}

const addShipmentItemSchema = z.object({
  orderItemId: z.string(),
  batchId: z.string(),
  quantity: z.number().int().min(1),
});

// Validates that `batchId` is a legal pick for `orderItemId`, and how much of
// it is still owed: a plain-variant line must draw from a batch of that same
// variant; a kit line must draw from a batch of one of the kit's component
// variants, capped at that component's per-kit quantity times how many kits
// were ordered (not the kit line's raw `quantity`, which is kit count).
async function assertValidPick(
  tx: TxOrClient,
  orderItemId: string,
  batchVariantId: string,
  quantity: number
) {
  const orderItem = await tx.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      kit: { include: { items: true } },
      shipmentItems: { include: { batch: { select: { variantId: true } } } },
    },
  });
  if (!orderItem) throw { statusCode: 404, message: 'Order item not found' };

  if (orderItem.variantId) {
    if (orderItem.variantId !== batchVariantId) {
      throw { statusCode: 400, message: 'This batch does not match the ordered product' };
    }
    const alreadyShipped = orderItem.shipmentItems.reduce((s, si) => s + si.quantity, 0);
    if (alreadyShipped + quantity > orderItem.quantity) {
      throw { statusCode: 400, message: `Only ${orderItem.quantity - alreadyShipped} of this line remain unshipped` };
    }
    return orderItem;
  }

  // Kit line — batch must belong to one of the kit's component variants.
  const kitItem = orderItem.kit?.items.find((ki) => ki.variantId === batchVariantId);
  if (!kitItem) {
    throw { statusCode: 400, message: 'This batch does not match any component of the ordered kit' };
  }
  const required = kitItem.quantity * orderItem.quantity;
  const alreadyShipped = orderItem.shipmentItems
    .filter((si) => si.batch.variantId === batchVariantId)
    .reduce((s, si) => s + si.quantity, 0);
  if (alreadyShipped + quantity > required) {
    throw { statusCode: 400, message: `Only ${required - alreadyShipped} of this kit component remain unshipped` };
  }
  return orderItem;
}

export async function adminAddShipmentItem(fastify: FastifyInstance, shipmentId: string, body: unknown) {
  const data = addShipmentItemSchema.parse(body);

  return fastify.prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw { statusCode: 404, message: 'Shipment not found' };
    if (shipment.shippedAt) throw { statusCode: 400, message: 'This shipment has already been marked shipped' };

    const orderItem = await tx.orderItem.findUnique({ where: { id: data.orderItemId } });
    if (!orderItem || orderItem.orderId !== shipment.orderId) {
      throw { statusCode: 400, message: 'This order item does not belong to the shipment\'s order' };
    }

    const batch = await tx.batch.findUnique({ where: { id: data.batchId } });
    if (!batch) throw { statusCode: 404, message: 'Batch not found' };

    await assertValidPick(tx, data.orderItemId, batch.variantId, data.quantity);

    // Conditional decrement guards against oversell under concurrency — the
    // WHERE clause only matches if enough quantity remains, so two
    // simultaneous picks against the same batch can't both succeed.
    const dec = await tx.batch.updateMany({
      where: { id: data.batchId, quantity: { gte: data.quantity } },
      data: { quantity: { decrement: data.quantity } },
    });
    if (dec.count === 0) {
      throw { statusCode: 400, message: `Insufficient quantity in batch ${batch.batchNumber}` };
    }
    const updatedBatch = await tx.batch.findUniqueOrThrow({ where: { id: data.batchId } });
    if (updatedBatch.quantity === 0 && updatedBatch.status !== 'DEPLETED') {
      await tx.batch.update({ where: { id: data.batchId }, data: { status: 'DEPLETED' } });
    }

    return tx.shipmentItem.create({
      data: { shipmentId, orderItemId: data.orderItemId, batchId: data.batchId, quantity: data.quantity },
      include: { batch: true, orderItem: true },
    });
  });
}

// Whether every OrderItem on this order now has full ShipmentItem coverage —
// checked across ALL of the order's shipments, not just one, since an order
// can ship in multiple parts (PARTIALLY_SHIPPED).
async function isOrderFullyShipped(tx: TxOrClient, orderId: string): Promise<boolean> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: {
      kit: { include: { items: true } },
      shipmentItems: { include: { batch: { select: { variantId: true } } } },
    },
  });

  for (const item of items) {
    if (item.variantId) {
      const shipped = item.shipmentItems.reduce((s, si) => s + si.quantity, 0);
      if (shipped < item.quantity) return false;
    } else if (item.kit) {
      for (const ki of item.kit.items) {
        const required = ki.quantity * item.quantity;
        const shipped = item.shipmentItems
          .filter((si) => si.batch.variantId === ki.variantId)
          .reduce((s, si) => s + si.quantity, 0);
        if (shipped < required) return false;
      }
    }
  }
  return true;
}

const shipShipmentSchema = z.object({
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
});

export async function adminShipShipment(fastify: FastifyInstance, shipmentId: string, body: unknown) {
  const data = shipShipmentSchema.parse(body);

  return fastify.prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({ where: { id: shipmentId }, include: { items: true } });
    if (!shipment) throw { statusCode: 404, message: 'Shipment not found' };
    if (shipment.shippedAt) throw { statusCode: 400, message: 'This shipment has already been marked shipped' };
    if (shipment.items.length === 0) throw { statusCode: 400, message: 'Add at least one item before marking this shipment shipped' };

    const updated = await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        shippedAt: new Date(),
        carrier: data.carrier ?? shipment.carrier,
        trackingNumber: data.trackingNumber ?? shipment.trackingNumber,
      },
    });

    const fullyShipped = await isOrderFullyShipped(tx, shipment.orderId);
    const newStatus = fullyShipped ? 'SHIPPED' : 'PARTIALLY_SHIPPED';
    await tx.order.update({ where: { id: shipment.orderId }, data: { status: newStatus } });
    await tx.orderStatusHistory.create({
      data: { orderId: shipment.orderId, status: newStatus, note: `Shipment ${shipment.shipmentNumber} shipped` },
    });

    return updated;
  });
}
