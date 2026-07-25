import type { FastifyInstance } from 'fastify';
import {
  adminListKits,
  adminGetKit,
  adminCreateKit,
  adminUpdateKit,
  adminDeleteKit,
} from './admin-kits.controller.js';

export default async function adminKitRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return adminListKits(fastify, request.query as Record<string, string>);
  });

  fastify.post('/', async (request) => {
    return adminCreateKit(fastify, request.body);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return adminGetKit(fastify, request.params.id);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    return adminUpdateKit(fastify, request.params.id, request.body);
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request) => {
    return adminDeleteKit(fastify, request.params.id);
  });
}
