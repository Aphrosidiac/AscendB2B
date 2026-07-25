import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPaginationParams, paginatedResponse } from '../../utils/pagination.js';

// Admin-safe fields only — never passwordHash. There is deliberately no
// create endpoint: companies self-signup (see companies.controller.ts), and
// no separate "approve" flag exists — raising creditTerms off PREPAID here
// IS the credit-approval mechanism (see schema.prisma's Company comment).
const adminUpdateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  taxId: z.string().nullable().optional(),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  creditTerms: z.enum(['PREPAID', 'NET15', 'NET30', 'NET60']).optional(),
});

function stripPasswordHash<T extends { passwordHash: string }>(company: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = company;
  return safe;
}

export async function adminListCompanies(fastify: FastifyInstance, query: Record<string, string>) {
  const { page, limit, skip } = getPaginationParams(query);
  const where: Record<string, unknown> = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [companies, total] = await Promise.all([
    fastify.prisma.company.findMany({
      where,
      include: { _count: { select: { orders: true, quotations: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    fastify.prisma.company.count({ where }),
  ]);

  return paginatedResponse(companies.map(stripPasswordHash), total, page, limit);
}

// Small admin overview: the company's own record plus its addresses and a
// lightweight order/quotation summary — not a full order history page (that
// already exists at admin-orders.controller.ts, filterable by companyId).
export async function adminGetCompany(fastify: FastifyInstance, id: string) {
  const company = await fastify.prisma.company.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: { createdAt: 'desc' } },
      _count: { select: { orders: true, quotations: true } },
    },
  });
  if (!company) throw { statusCode: 404, message: 'Company not found' };

  const [orderStats, recentOrders] = await Promise.all([
    fastify.prisma.order.aggregate({
      where: { companyId: id, deletedAt: null },
      _sum: { total: true },
    }),
    fastify.prisma.order.findMany({
      where: { companyId: id, deletedAt: null },
      select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    ...stripPasswordHash(company),
    lifetimeOrderValue: orderStats._sum.total ?? 0,
    recentOrders,
  };
}

export async function adminUpdateCompany(fastify: FastifyInstance, id: string, body: unknown) {
  const data = adminUpdateCompanySchema.parse(body);
  const existing = await fastify.prisma.company.findUnique({ where: { id } });
  if (!existing) throw { statusCode: 404, message: 'Company not found' };

  const updated = await fastify.prisma.company.update({ where: { id }, data });
  return stripPasswordHash(updated);
}
