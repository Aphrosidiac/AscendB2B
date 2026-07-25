import type { FastifyInstance } from 'fastify';
import {
  adminListInvoices,
  adminGetInvoice,
  adminGenerateInvoice,
  adminRecordPayment,
  adminVoidInvoice,
} from './admin-invoices.controller.js';

export default async function adminInvoiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return adminListInvoices(fastify, request.query as Record<string, string>);
  });

  fastify.post('/', async (request) => {
    return adminGenerateInvoice(fastify, request.body);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return adminGetInvoice(fastify, request.params.id);
  });

  fastify.post<{ Params: { id: string } }>('/:id/payments', async (request) => {
    return adminRecordPayment(fastify, request.params.id, request.body);
  });

  fastify.post<{ Params: { id: string } }>('/:id/void', async (request) => {
    return adminVoidInvoice(fastify, request.params.id);
  });
}
