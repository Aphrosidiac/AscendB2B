import type { FastifyInstance } from 'fastify';
import { signup, login, getMe } from './companies.controller.js';

export default async function companyRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/signup',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      return signup(fastify, request.body);
    }
  );

  fastify.post(
    '/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      return login(fastify, request.body);
    }
  );

  fastify.get('/me', { preHandler: [fastify.authenticateCompany] }, async (request) => {
    return getMe(fastify, request.user.id);
  });
}
