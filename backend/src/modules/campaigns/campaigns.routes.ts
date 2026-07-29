import type { FastifyInstance } from 'fastify';
import { listCampaigns, getCampaign } from './campaigns.controller.js';

export default async function campaignRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request) => {
    const query = request.query as Record<string, string>;
    return listCampaigns(fastify, query);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return getCampaign(fastify, request.params.id);
  });
}
