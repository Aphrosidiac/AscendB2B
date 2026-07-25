import type { FastifyInstance } from 'fastify';
import {
  adminListQuotations,
  adminGetQuotation,
  adminGetQuotationPdf,
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

  fastify.get<{ Params: { id: string } }>('/:id/pdf', async (request, reply) => {
    const { quotation, pdf } = await adminGetQuotationPdf(fastify, request.params.id);
    const safeFilename = quotation.quoteNumber.replace(/[^a-zA-Z0-9\-_\/]/g, '').replace(/\//g, '-');
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="ASCEND-Quotation-${safeFilename}.pdf"`);
    reply.header('Referrer-Policy', 'no-referrer');
    return reply.send(pdf);
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
