import type { FastifyInstance } from 'fastify';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';
import { PUBLIC_KIT_WHERE, getKitAvailability } from '../../utils/kit-availability.js';

// Component variants are exposed by name/size/code only — no per-component
// price. A kit is sold at its own pricePerKit, and listing what each part
// would cost separately invites the customer to price-check the bundle
// against the catalog line by line.
const PUBLIC_KIT_INCLUDE = {
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
  campaign: {
    select: { id: true, name: true, status: true, closesAt: true, estimatedArrival: true },
  },
} as const;

export async function listKits(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);

  const where: Record<string, unknown> = { ...PUBLIC_KIT_WHERE };
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

  const [kits, total] = await Promise.all([
    fastify.prisma.kit.findMany({
      where,
      include: PUBLIC_KIT_INCLUDE,
      // Campaign kits first — they're the time-limited ones a buyer can miss.
      orderBy: [{ campaignId: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    fastify.prisma.kit.count({ where }),
  ]);

  const availability = await getKitAvailability(fastify.prisma, kits);

  return paginatedResponse(
    kits.map((kit) => ({ ...kit, available: availability.get(kit.id) ?? 0 })),
    total,
    page,
    limit
  );
}

export async function getKit(fastify: FastifyInstance, id: string) {
  // Filtered by the same public rule as the listing, not just by id — a kit
  // whose campaign has closed must 404 on a direct link, not render a page
  // whose Add to Cart the order endpoint will then reject.
  const kit = await fastify.prisma.kit.findFirst({
    where: { id, ...PUBLIC_KIT_WHERE },
    include: PUBLIC_KIT_INCLUDE,
  });

  if (!kit) {
    throw { statusCode: 404, message: 'Kit not found' };
  }

  const availability = await getKitAvailability(fastify.prisma, [kit]);

  return { ...kit, available: availability.get(kit.id) ?? 0 };
}
