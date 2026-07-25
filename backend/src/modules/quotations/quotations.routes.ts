import type { FastifyInstance } from 'fastify';
import {
  requestQuotation,
  listMyQuotations,
  getMyQuotation,
  getMyQuotationPdf,
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

  fastify.get<{ Params: { id: string } }>(
    '/:id/pdf',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { quotation, pdf } = await getMyQuotationPdf(fastify, request.user.id, request.params.id);
      const safeFilename = quotation.quoteNumber.replace(/[^a-zA-Z0-9\-_\/]/g, '').replace(/\//g, '-');
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="ASCEND-Quotation-${safeFilename}.pdf"`);
      reply.header('Referrer-Policy', 'no-referrer');
      return reply.send(pdf);
    }
  );

  fastify.post<{ Params: { id: string } }>('/:id/accept', async (request) => {
    return acceptMyQuotation(fastify, request.user.id, request.params.id, request.body);
  });

  fastify.post<{ Params: { id: string } }>('/:id/reject', async (request) => {
    return rejectMyQuotation(fastify, request.user.id, request.params.id);
  });
}
