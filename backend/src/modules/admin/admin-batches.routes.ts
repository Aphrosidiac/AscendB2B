import type { FastifyInstance } from 'fastify';
import {
  adminListBatches,
  adminGetBatch,
  adminCreateBatch,
  adminUpdateBatch,
  adminDeleteBatch,
} from './admin-batches.controller.js';

export default async function adminBatchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return adminListBatches(fastify, request.query as Record<string, string>);
  });

  fastify.post('/', async (request) => {
    return adminCreateBatch(fastify, request.body);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return adminGetBatch(fastify, request.params.id);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    return adminUpdateBatch(fastify, request.params.id, request.body);
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request) => {
    return adminDeleteBatch(fastify, request.params.id);
  });
}
