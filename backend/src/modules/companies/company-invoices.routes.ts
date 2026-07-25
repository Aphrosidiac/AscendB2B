import type { FastifyInstance } from 'fastify';
import { listMyInvoices, getMyInvoice } from './company-invoices.controller.js';

export default async function companyInvoiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticateCompany);

  fastify.get('/', async (request) => {
    return listMyInvoices(fastify, request.user.id, request.query as Record<string, string>);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return getMyInvoice(fastify, request.user.id, request.params.id);
  });
}
