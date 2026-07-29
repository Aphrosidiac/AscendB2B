import type { FastifyInstance } from 'fastify';
import { listKits, getKit } from './kits.controller.js';

export default async function kitRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request) => {
    const query = request.query as Record<string, string>;
    return listKits(fastify, query);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return getKit(fastify, request.params.id);
  });
}
