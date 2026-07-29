import type { FastifyInstance } from 'fastify';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { getKitAvailability } from '../../utils/kit-availability.js';

// Only OPEN campaigns are public. DRAFT ones haven't been announced, and
// CLOSED/SOLD_OUT ones can't be ordered against — a buyer who already placed a
// pre-order tracks it through /account/orders, not here. Matches the campaign
// half of PUBLIC_KIT_WHERE; the two must move together.
const PUBLIC_CAMPAIGN_WHERE = { status: 'OPEN' as const };

const PUBLIC_CAMPAIGN_INCLUDE = {
  kits: {
    where: { active: true },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              code: true,
              size: true,
              imageUrl: true,
              product: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  },
  // What this campaign is bringing in. batchNumber is deliberately omitted —
  // it's an internal fulfilment reference, and the per-batch COA is the part
  // that matters to a buyer deciding whether to commit ahead of arrival.
  batches: {
    select: {
      id: true,
      quantity: true,
      status: true,
      expiry: true,
      coaUrl: true,
      variant: {
        select: {
          id: true,
          code: true,
          size: true,
          product: { select: { name: true, slug: true } },
        },
      },
    },
  },
} as const;

export async function listCampaigns(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);

  const [campaigns, total] = await Promise.all([
    fastify.prisma.preorderCampaign.findMany({
      where: PUBLIC_CAMPAIGN_WHERE,
      include: PUBLIC_CAMPAIGN_INCLUDE,
      // Soonest to close first — that's the one a buyer needs to act on.
      orderBy: { closesAt: 'asc' },
      skip,
      take: limit,
    }),
    fastify.prisma.preorderCampaign.count({ where: PUBLIC_CAMPAIGN_WHERE }),
  ]);

  const availability = await getKitAvailability(
    fastify.prisma,
    campaigns.flatMap((c) => c.kits)
  );

  return paginatedResponse(
    campaigns.map((campaign) => ({
      ...campaign,
      kits: campaign.kits.map((kit) => ({ ...kit, available: availability.get(kit.id) ?? 0 })),
    })),
    total,
    page,
    limit
  );
}

export async function getCampaign(fastify: FastifyInstance, id: string) {
  const campaign = await fastify.prisma.preorderCampaign.findFirst({
    where: { id, ...PUBLIC_CAMPAIGN_WHERE },
    include: PUBLIC_CAMPAIGN_INCLUDE,
  });

  if (!campaign) {
    throw { statusCode: 404, message: 'Campaign not found' };
  }

  const availability = await getKitAvailability(fastify.prisma, campaign.kits);

  return {
    ...campaign,
    kits: campaign.kits.map((kit) => ({ ...kit, available: availability.get(kit.id) ?? 0 })),
  };
}
