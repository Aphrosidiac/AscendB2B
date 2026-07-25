import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const addressSchema = z.object({
  label: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postcode: z.string().min(1),
  type: z.enum(['BILLING', 'SHIPPING', 'BOTH']).optional(),
});

const updateAddressSchema = addressSchema.partial();

export async function listAddresses(fastify: FastifyInstance, companyId: string) {
  return fastify.prisma.companyAddress.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createAddress(fastify: FastifyInstance, companyId: string, body: unknown) {
  const data = addressSchema.parse(body);
  return fastify.prisma.companyAddress.create({ data: { ...data, companyId } });
}

// Ownership check on every mutation — a company address is never
// cross-visible/editable by another company, id-guessing included.
async function requireOwnAddress(fastify: FastifyInstance, companyId: string, id: string) {
  const address = await fastify.prisma.companyAddress.findUnique({ where: { id } });
  if (!address || address.companyId !== companyId) {
    throw { statusCode: 404, message: 'Address not found' };
  }
  return address;
}

export async function updateAddress(fastify: FastifyInstance, companyId: string, id: string, body: unknown) {
  const data = updateAddressSchema.parse(body);
  await requireOwnAddress(fastify, companyId, id);
  return fastify.prisma.companyAddress.update({ where: { id }, data });
}

export async function deleteAddress(fastify: FastifyInstance, companyId: string, id: string) {
  await requireOwnAddress(fastify, companyId, id);
  // Order.shippingAddressId has no cascade, so an address already referenced
  // by an order can't be hard-deleted — same "restrict FK" situation as
  // ProductVariant. Nothing else here needs the row to survive, so there's
  // no soft-delete flag on CompanyAddress; this just surfaces the DB's own
  // restriction as a clean 400 instead of a raw 500.
  try {
    await fastify.prisma.companyAddress.delete({ where: { id } });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2003') {
      throw { statusCode: 400, message: 'This address is used by an existing order and cannot be deleted' };
    }
    throw err;
  }
  return { success: true };
}
