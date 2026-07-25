import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';

function checkCampaignDateOrder(data: { opensAt?: string; closesAt?: string }, ctx: z.RefinementCtx) {
  if (data.opensAt && data.closesAt && new Date(data.opensAt) > new Date(data.closesAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['closesAt'], message: 'closesAt must be on or after opensAt' });
  }
}

// Kept as a plain ZodObject (not wrapped in .superRefine) so .partial() below
// still works — same discipline as admin-products.controller.ts's
// productObjectSchema.
const campaignObjectSchema = z.object({
  name: z.string().min(1),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  estimatedArrival: z.string().datetime(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'SOLD_OUT']).optional(),
});

const createCampaignSchema = campaignObjectSchema.superRefine(checkCampaignDateOrder);
const updateCampaignSchema = campaignObjectSchema.partial().superRefine(checkCampaignDateOrder);

function toCampaignData(v: { opensAt?: string; closesAt?: string; estimatedArrival?: string }) {
  return {
    opensAt: v.opensAt ? new Date(v.opensAt) : undefined,
    closesAt: v.closesAt ? new Date(v.closesAt) : undefined,
    estimatedArrival: v.estimatedArrival ? new Date(v.estimatedArrival) : undefined,
  };
}

export async function adminListCampaigns(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

  const [campaigns, total] = await Promise.all([
    fastify.prisma.preorderCampaign.findMany({
      where,
      include: { _count: { select: { batches: true, kits: true } } },
      orderBy: { opensAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.preorderCampaign.count({ where }),
  ]);

  return paginatedResponse(campaigns, total, page, limit);
}

export async function adminGetCampaign(fastify: FastifyInstance, id: string) {
  const campaign = await fastify.prisma.preorderCampaign.findUnique({
    where: { id },
    include: {
      batches: {
        include: { variant: { select: { id: true, code: true, size: true, product: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      },
      kits: {
        include: { items: { include: { variant: { select: { id: true, code: true, size: true } } } } },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { batches: true, kits: true } },
    },
  });
  if (!campaign) throw { statusCode: 404, message: 'Campaign not found' };
  return campaign;
}

export async function adminCreateCampaign(fastify: FastifyInstance, body: unknown) {
  const data = createCampaignSchema.parse(body);
  return fastify.prisma.preorderCampaign.create({
    data: {
      name: data.name,
      status: data.status,
      opensAt: new Date(data.opensAt),
      closesAt: new Date(data.closesAt),
      estimatedArrival: new Date(data.estimatedArrival),
    },
  });
}

export async function adminUpdateCampaign(fastify: FastifyInstance, id: string, body: unknown) {
  const data = updateCampaignSchema.parse(body);
  const existing = await fastify.prisma.preorderCampaign.findUnique({ where: { id } });
  if (!existing) throw { statusCode: 404, message: 'Campaign not found' };

  return fastify.prisma.preorderCampaign.update({
    where: { id },
    data: { name: data.name, status: data.status, ...toCampaignData(data) },
  });
}

export async function adminDeleteCampaign(fastify: FastifyInstance, id: string) {
  const existing = await fastify.prisma.preorderCampaign.findUnique({ where: { id } });
  if (!existing) throw { statusCode: 404, message: 'Campaign not found' };

  // Batch.campaignId and Kit.campaignId are both ON DELETE SET NULL (see the
  // migration) — deleting a campaign just detaches its batches/kits rather
  // than being blocked or cascading, so this can never hit a P2003.
  await fastify.prisma.preorderCampaign.delete({ where: { id } });
  return { success: true };
}
