import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    // Pin the algorithm on both sign and verify so the accepted-alg set can't
    // silently widen (alg-confusion hardening).
    sign: { algorithm: 'HS256', expiresIn: '24h' },
    verify: { algorithms: ['HS256'] },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    // A Company token is a structurally valid JWT too (same secret) — without
    // this check it would pass jwtVerify and admin route handlers would look
    // up request.user.id in AdminUser, which either 404s or (worse, for a
    // handler that doesn't re-verify the row) silently treats a company as an
    // admin. Admin tokens never carry `role`, so this only rejects the other
    // principal type.
    if (request.user.role === 'company') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Parallel guard for the Company principal — mirrors `authenticate` above
  // but rejects everything except a company-issued token, so an admin token
  // can't be replayed against company-scoped routes either.
  fastify.decorate('authenticateCompany', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role !== 'company') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateCompany: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role?: 'company' };
    user: { id: string; email: string; role?: 'company' };
  }
}
