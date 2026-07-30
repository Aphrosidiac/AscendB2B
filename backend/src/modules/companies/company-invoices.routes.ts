import type { FastifyInstance } from 'fastify';
import { listMyInvoices, getMyInvoice, getMyInvoicePdf } from './company-invoices.controller.js';

export default async function companyInvoiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticateCompany);

  fastify.get('/', async (request) => {
    return listMyInvoices(fastify, request.user.id, request.query as Record<string, string>);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return getMyInvoice(fastify, request.user.id, request.params.id);
  });

  // Same shape as the quotation PDF route: rate-limited (PDF generation is
  // the most expensive thing a company can trigger), inline disposition, and
  // no-referrer so the invoice URL can't leak via an embedded viewer.
  fastify.get<{ Params: { id: string } }>(
    '/:id/pdf',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { invoice, pdf } = await getMyInvoicePdf(fastify, request.user.id, request.params.id);
      const safeFilename = invoice.invoiceNumber.replace(/[^a-zA-Z0-9\-_\/]/g, '').replace(/\//g, '-');
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="ASCEND-Invoice-${safeFilename}.pdf"`);
      reply.header('Referrer-Policy', 'no-referrer');
      return reply.send(pdf);
    }
  );
}
