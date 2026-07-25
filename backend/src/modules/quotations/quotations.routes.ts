import type { FastifyInstance } from 'fastify';
import {
  requestQuotation,
  listMyQuotations,
  getMyQuotation,
  acceptMyQuotation,
  rejectMyQuotation,
} from './quotations.controller.js';

export default async function quotationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticateCompany);

  fastify.get('/', async (request) => {
    return listMyQuotations(fastify, request.user.id, request.query as Record<string, string>);
  });

  fastify.post('/', async (request) => {
    return requestQuotation(fastify, request.user.id, request.body);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return getMyQuotation(fastify, request.user.id, request.params.id);
  });

  fastify.post<{ Params: { id: string } }>('/:id/accept', async (request) => {
    return acceptMyQuotation(fastify, request.user.id, request.params.id, request.body);
  });

  fastify.post<{ Params: { id: string } }>('/:id/reject', async (request) => {
    return rejectMyQuotation(fastify, request.user.id, request.params.id);
  });
}
