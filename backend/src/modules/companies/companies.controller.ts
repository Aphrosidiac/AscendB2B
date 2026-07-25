import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const signupSchema = z.object({
  name: z.string().min(1),
  taxId: z.string().optional(),
  contactName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Same anti-enumeration trick as admin auth.controller.ts: compared against
// on a not-found email so unknown-email and wrong-password take equal time.
const DUMMY_HASH = '$2b$12$VrNkdp05BDXELusXONkTreWe31fJHex0cpnFDrJREMb8WiI55d49O';

function toCompanyProfile(company: {
  id: string;
  name: string;
  taxId: string | null;
  contactName: string;
  phone: string;
  email: string;
  emailVerifiedAt: Date | null;
  creditTerms: string;
  createdAt: Date;
}) {
  const { id, name, taxId, contactName, phone, email, emailVerifiedAt, creditTerms, createdAt } = company;
  return { id, name, taxId, contactName, phone, email, emailVerifiedAt, creditTerms, createdAt };
}

export async function signup(fastify: FastifyInstance, body: unknown) {
  const data = signupSchema.parse(body);

  const existing = await fastify.prisma.company.findUnique({ where: { email: data.email } });
  if (existing) {
    throw { statusCode: 409, message: 'An account with this email already exists' };
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  // creditTerms deliberately not set — Prisma default (PREPAID) applies, and
  // there's no approval step: a signed-up company can transact immediately.
  const company = await fastify.prisma.company.create({
    data: {
      name: data.name,
      taxId: data.taxId,
      contactName: data.contactName,
      phone: data.phone,
      email: data.email,
      passwordHash,
    },
  });

  const token = fastify.jwt.sign({ id: company.id, email: company.email, role: 'company' });
  return { token, company: toCompanyProfile(company) };
}

export async function login(fastify: FastifyInstance, body: unknown) {
  const { email, password } = loginSchema.parse(body);

  const company = await fastify.prisma.company.findUnique({ where: { email } });
  if (!company) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw { statusCode: 401, message: 'Invalid email or password' };
  }

  const valid = await bcrypt.compare(password, company.passwordHash);
  if (!valid) {
    throw { statusCode: 401, message: 'Invalid email or password' };
  }

  const token = fastify.jwt.sign({ id: company.id, email: company.email, role: 'company' });
  return { token, company: toCompanyProfile(company) };
}

export async function getMe(fastify: FastifyInstance, companyId: string) {
  const company = await fastify.prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw { statusCode: 404, message: 'Company not found' };
  }
  return toCompanyProfile(company);
}
