import type { FastifyInstance } from 'fastify';
import {
  adminListCompanies,
  adminGetCompany,
  adminUpdateCompany,
} from './admin-companies.controller.js';

// No POST — companies self-signup (see companies.controller.ts). This is
// view/edit only.
export default async function adminCompanyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return adminListCompanies(fastify, request.query as Record<string, string>);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return adminGetCompany(fastify, request.params.id);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    return adminUpdateCompany(fastify, request.params.id, request.body);
  });
}
