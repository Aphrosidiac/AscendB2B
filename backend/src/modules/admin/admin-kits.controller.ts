import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { notifyRevalidate } from '../../utils/revalidate.js';

// Present = update this existing item; absent = create a new one. Any
// existing item not present in the submitted array gets deleted — same
// full-replace convention as admin-quotations.controller.ts's items and
// admin-products.controller.ts's variants array.
const kitItemSchema = z.object({
  id: z.string().optional(),
  variantId: z.string().min(1),
  quantity: z.number().int().min(1),
});

const kitObjectSchema = z.object({
  name: z.string().min(1),
  pricePerKit: z.number().int().min(0),
  qtyPerKit: z.number().int().min(1),
  campaignId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  // Undefined leaves existing items untouched (partial update); an array
  // (even []) is a full replacement.
  items: z.array(kitItemSchema).optional(),
});

// A brand new kit needs at least one component to be sellable.
const createKitSchema = kitObjectSchema.extend({ items: z.array(kitItemSchema).min(1) });
const updateKitSchema = kitObjectSchema.partial();

const KIT_INCLUDE = {
  items: { include: { variant: { select: { id: true, code: true, size: true, product: { select: { name: true } } } } } },
  campaign: { select: { id: true, name: true, status: true } },
} as const;

export async function adminListKits(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.active === 'true') where.active = true;
  if (query.active === 'false') where.active = false;
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

  const [kits, total] = await Promise.all([
    fastify.prisma.kit.findMany({
      where,
      include: KIT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.kit.count({ where }),
  ]);

  return paginatedResponse(kits, total, page, limit);
}

export async function adminGetKit(fastify: FastifyInstance, id: string) {
  const kit = await fastify.prisma.kit.findUnique({ where: { id }, include: KIT_INCLUDE });
  if (!kit) throw { statusCode: 404, message: 'Kit not found' };
  return kit;
}

export async function adminCreateKit(fastify: FastifyInstance, body: unknown) {
  const { items, ...data } = createKitSchema.parse(body);

  const created = await fastify.prisma.$transaction(async (tx) => {
    const kit = await tx.kit.create({ data });
    await tx.kitItem.createMany({
      data: items.map((i) => ({ kitId: kit.id, variantId: i.variantId, quantity: i.quantity })),
    });
    return tx.kit.findUniqueOrThrow({ where: { id: kit.id }, include: KIT_INCLUDE });
  });

  notifyRevalidate(['kits']);
  return created;
}

export async function adminUpdateKit(fastify: FastifyInstance, id: string, body: unknown) {
  const { items, ...data } = updateKitSchema.parse(body);

  const existing = await fastify.prisma.kit.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw { statusCode: 404, message: 'Kit not found' };

  const updated = await fastify.prisma.$transaction(async (tx) => {
    await tx.kit.update({ where: { id }, data });

    if (items !== undefined) {
      const existingIds = new Set(existing.items.map((i) => i.id));
      const submittedIds = new Set(items.filter((i) => i.id).map((i) => i.id!));

      for (const item of items) {
        if (item.id) {
          if (!existingIds.has(item.id)) {
            throw { statusCode: 400, message: `Item ${item.id} does not belong to this kit` };
          }
          await tx.kitItem.update({ where: { id: item.id }, data: { variantId: item.variantId, quantity: item.quantity } });
        } else {
          await tx.kitItem.create({ data: { kitId: id, variantId: item.variantId, quantity: item.quantity } });
        }
      }

      const removedIds = [...existingIds].filter((eid) => !submittedIds.has(eid));
      if (removedIds.length > 0) {
        await tx.kitItem.deleteMany({ where: { id: { in: removedIds } } });
      }
    }

    return tx.kit.findUniqueOrThrow({ where: { id }, include: KIT_INCLUDE });
  });

  notifyRevalidate(['kits']);
  return updated;
}

export async function adminDeleteKit(fastify: FastifyInstance, id: string) {
  const existing = await fastify.prisma.kit.findUnique({ where: { id } });
  if (!existing) throw { statusCode: 404, message: 'Kit not found' };

  // kit_items.kitId cascades, and order_items/quotation_items.kitId are both
  // ON DELETE SET NULL (see the migration) — unlike Batch/ProductVariant, a
  // hard delete here can never hit a Restrict FK, so no soft-delete fallback
  // is needed. Historical order/quote lines keep their own snapshotted
  // quantity/unitPrice; only the kit reference itself is cleared.
  await fastify.prisma.kit.delete({ where: { id } });
  notifyRevalidate(['kits']);
  return { success: true };
}
