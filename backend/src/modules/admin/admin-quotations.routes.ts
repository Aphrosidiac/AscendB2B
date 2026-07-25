import type { FastifyInstance } from 'fastify';
import {
  adminListQuotations,
  adminGetQuotation,
  adminUpdateQuotation,
  adminSendQuotation,
  adminSetQuotationStatus,
} from './admin-quotations.controller.js';

export default async function adminQuotationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return adminListQuotations(fastify, request.query as Record<string, string>);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return adminGetQuotation(fastify, request.params.id);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    return adminUpdateQuotation(fastify, request.params.id, request.body);
  });

  fastify.post<{ Params: { id: string } }>('/:id/send', async (request) => {
    return adminSendQuotation(fastify, request.params.id);
  });

  fastify.post<{ Params: { id: string } }>('/:id/status', async (request) => {
    return adminSetQuotationStatus(fastify, request.params.id, request.body);
  });
}
