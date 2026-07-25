import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOrder, listMyOrders, getMyOrder } from './orders.controller.js';
import { getMyReceiptData, getMyReceiptPdf } from './receipt.controller.js';
import { validateDiscountCode } from '../admin/admin-discounts.controller.js';

const validateDiscountSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().int().min(0),
});

// Every route here is a Company acting on its own orders — the old
// guest/phone-based checkout and lookup are gone entirely (B2B requires a
// signed-in Company to transact at all; see docs/erd-b2b.md).
export default async function orderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticateCompany);

  fastify.post(
    '/',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      return createOrder(fastify, request.user.id, request.body);
    }
  );

  fastify.get('/', async (request) => {
    return listMyOrders(fastify, request.user.id, request.query as Record<string, string>);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return getMyOrder(fastify, request.user.id, request.params.id);
  });

  fastify.get<{ Params: { id: string } }>(
    '/:id/receipt',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      return getMyReceiptData(fastify, request.user.id, request.params.id);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id/receipt/pdf',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { order, pdf } = await getMyReceiptPdf(fastify, request.user.id, request.params.id);
      const safeFilename = order.orderNumber.replace(/[^a-zA-Z0-9\-_\/]/g, '').replace(/\//g, '-');
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="ASCEND-Receipt-${safeFilename}.pdf"`);
      reply.header('Referrer-Policy', 'no-referrer');
      return reply.send(pdf);
    }
  );

  fastify.post(
    '/validate-discount',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request) => {
      const { code, subtotal } = validateDiscountSchema.parse(request.body);
      const { discount, discountAmount } = await validateDiscountCode(fastify, code, subtotal);
      return {
        code: discount.code,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        discountAmount,
      };
    }
  );
}
