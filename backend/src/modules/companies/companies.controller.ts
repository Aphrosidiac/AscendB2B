import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

// Signup is deliberately minimal: a handle, an email and a password. Company
// name, registration number, contact name and phone are all captured later by
// updateMe (the business-profile step) — asking for them up front was friction
// in front of an account that can't do anything until it's approved anyway.
const signupSchema = z.object({
  // Lowercased before storage so uniqueness is effectively case-insensitive —
  // "Acme" and "acme" must not become two accounts.
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only use letters, numbers, hyphens and underscores')
    .transform((v) => v.toLowerCase()),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Everything signup no longer asks for. Each field is individually optional so
// the profile can be filled in over more than one save, but ordering stays
// blocked until the set assertProfileComplete requires is present.
const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  taxId: z.string().nullable().optional(),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
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
  username: string;
  name: string | null;
  taxId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string;
  emailVerifiedAt: Date | null;
  creditTerms: string;
  createdAt: Date;
}) {
  const { id, username, name, taxId, contactName, phone, email, emailVerifiedAt, creditTerms, createdAt } = company;
  return {
    id,
    username,
    name,
    taxId,
    contactName,
    phone,
    email,
    emailVerifiedAt,
    creditTerms,
    createdAt,
    // Derived rather than stored: the client shouldn't have to know which
    // fields make a profile orderable, and the rule lives in one place.
    profileComplete: isProfileComplete(company),
  };
}

/**
 * A profile is orderable once it has a legal entity name and a reachable
 * contact. All three are hard downstream requirements, not nice-to-haves:
 * `name` is the bill-to line on every invoice and quotation PDF, and
 * `contactName`/`phone` go into the payment gateway's bill payload and the
 * receipt PDF.
 */
export function isProfileComplete(company: {
  name: string | null;
  contactName: string | null;
  phone: string | null;
}): boolean {
  return Boolean(company.name && company.contactName && company.phone);
}

/**
 * Throws a 422 naming the gap, for callers that require an orderable profile.
 *
 * Declared as an assertion signature so callers get real narrowing afterwards
 * — the payment gateway's bill payload and the receipt PDF then type-check
 * against non-null contact fields without defensive `??` fallbacks that would
 * quietly paper over a missing gate.
 */
export function assertProfileComplete<
  T extends { name: string | null; contactName: string | null; phone: string | null },
>(company: T): asserts company is T & { name: string; contactName: string; phone: string } {
  if (isProfileComplete(company)) return;
  const missing = [
    !company.name && 'company name',
    !company.contactName && 'contact name',
    !company.phone && 'phone number',
  ].filter(Boolean);
  throw {
    statusCode: 422,
    message: `Complete your business profile first — still needed: ${missing.join(', ')}.`,
  };
}

export async function signup(fastify: FastifyInstance, body: unknown) {
  const data = signupSchema.parse(body);

  const [emailTaken, usernameTaken] = await Promise.all([
    fastify.prisma.company.findUnique({ where: { email: data.email } }),
    fastify.prisma.company.findUnique({ where: { username: data.username } }),
  ]);
  if (emailTaken) {
    throw { statusCode: 409, message: 'An account with this email already exists' };
  }
  if (usernameTaken) {
    throw { statusCode: 409, message: 'That username is already taken' };
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  // creditTerms deliberately not set — Prisma default (PREPAID) applies.
  // Business details are absent by design and captured later via updateMe.
  const company = await fastify.prisma.company.create({
    data: {
      username: data.username,
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

/**
 * The company's own business-profile save. Deliberately does NOT expose
 * username, email, password or creditTerms: the first two are identity, the
 * third has its own flow, and creditTerms is the supplier's commercial
 * decision — a customer raising their own payment terms would be the whole
 * point of the gate.
 */
export async function updateMe(fastify: FastifyInstance, companyId: string, body: unknown) {
  const data = updateMeSchema.parse(body);

  const existing = await fastify.prisma.company.findUnique({ where: { id: companyId } });
  if (!existing) {
    throw { statusCode: 404, message: 'Company not found' };
  }

  const company = await fastify.prisma.company.update({
    where: { id: companyId },
    // Undefined keys are omitted by Prisma, so a partial save leaves the rest
    // untouched. `taxId: null` explicitly clears it.
    data: {
      name: data.name,
      taxId: data.taxId,
      contactName: data.contactName,
      phone: data.phone,
    },
  });

  return toCompanyProfile(company);
}
