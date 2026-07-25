import type { FastifyInstance } from 'fastify';
import {
  adminListShipments,
  adminGetShipment,
  adminCreateShipment,
  adminAddShipmentItem,
  adminShipShipment,
} from './admin-shipments.controller.js';

export default async function adminShipmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return adminListShipments(fastify, request.query as Record<string, string>);
  });

  fastify.post('/', async (request) => {
    return adminCreateShipment(fastify, request.body);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return adminGetShipment(fastify, request.params.id);
  });

  fastify.post<{ Params: { id: string } }>('/:id/items', async (request) => {
    return adminAddShipmentItem(fastify, request.params.id, request.body);
  });

  fastify.post<{ Params: { id: string } }>('/:id/ship', async (request) => {
    return adminShipShipment(fastify, request.params.id, request.body);
  });
}
