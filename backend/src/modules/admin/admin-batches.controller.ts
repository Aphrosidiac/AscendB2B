import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';

const batchObjectSchema = z.object({
  variantId: z.string().min(1),
  campaignId: z.string().nullable().optional(),
  batchNumber: z.string().min(1),
  expiry: z.string().datetime(),
  coaUrl: z.string().nullable().optional(),
  quantity: z.number().int().min(0),
  status: z.enum(['INCOMING', 'IN_STOCK', 'DEPLETED']).optional(),
});

const createBatchSchema = batchObjectSchema;
const updateBatchSchema = batchObjectSchema.partial();

const BATCH_INCLUDE = {
  variant: { select: { id: true, code: true, size: true, product: { select: { id: true, name: true } } } },
  campaign: { select: { id: true, name: true, status: true } },
} as const;

export async function adminListBatches(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.variantId) where.variantId = query.variantId;
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.status) where.status = query.status;

  const [batches, total] = await Promise.all([
    fastify.prisma.batch.findMany({
      where,
      include: BATCH_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.batch.count({ where }),
  ]);

  return paginatedResponse(batches, total, page, limit);
}

export async function adminGetBatch(fastify: FastifyInstance, id: string) {
  const batch = await fastify.prisma.batch.findUnique({
    where: { id },
    include: { ...BATCH_INCLUDE, _count: { select: { shipmentItems: true } } },
  });
  if (!batch) throw { statusCode: 404, message: 'Batch not found' };
  return batch;
}

export async function adminCreateBatch(fastify: FastifyInstance, body: unknown) {
  const data = createBatchSchema.parse(body);

  const variant = await fastify.prisma.productVariant.findUnique({ where: { id: data.variantId } });
  if (!variant) throw { statusCode: 400, message: 'Variant not found' };
  if (data.campaignId) {
    const campaign = await fastify.prisma.preorderCampaign.findUnique({ where: { id: data.campaignId } });
    if (!campaign) throw { statusCode: 400, message: 'Campaign not found' };
  }

  return fastify.prisma.batch.create({
    data: {
      variantId: data.variantId,
      campaignId: data.campaignId,
      batchNumber: data.batchNumber,
      expiry: new Date(data.expiry),
      coaUrl: data.coaUrl,
      quantity: data.quantity,
      status: data.status,
    },
    include: BATCH_INCLUDE,
  });
}

export async function adminUpdateBatch(fastify: FastifyInstance, id: string, body: unknown) {
  const data = updateBatchSchema.parse(body);
  const existing = await fastify.prisma.batch.findUnique({ where: { id } });
  if (!existing) throw { statusCode: 404, message: 'Batch not found' };

  if (data.variantId) {
    const variant = await fastify.prisma.productVariant.findUnique({ where: { id: data.variantId } });
    if (!variant) throw { statusCode: 400, message: 'Variant not found' };
  }
  if (data.campaignId) {
    const campaign = await fastify.prisma.preorderCampaign.findUnique({ where: { id: data.campaignId } });
    if (!campaign) throw { statusCode: 400, message: 'Campaign not found' };
  }

  return fastify.prisma.batch.update({
    where: { id },
    data: {
      variantId: data.variantId,
      campaignId: data.campaignId,
      batchNumber: data.batchNumber,
      expiry: data.expiry ? new Date(data.expiry) : undefined,
      coaUrl: data.coaUrl,
      quantity: data.quantity,
      status: data.status,
    },
    include: BATCH_INCLUDE,
  });
}

export async function adminDeleteBatch(fastify: FastifyInstance, id: string) {
  const existing = await fastify.prisma.batch.findUnique({ where: { id } });
  if (!existing) throw { statusCode: 404, message: 'Batch not found' };

  // shipment_items.batchId is ON DELETE RESTRICT (see the migration) — a
  // batch already picked into a shipment can't be hard-deleted. Same
  // duck-typed P2003 convention as company-addresses.controller.ts.
  try {
    await fastify.prisma.batch.delete({ where: { id } });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2003') {
      throw { statusCode: 400, message: 'This batch has already been used in a shipment and cannot be deleted' };
    }
    throw err;
  }
  return { success: true };
}
