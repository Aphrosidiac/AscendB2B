import type { FastifyInstance } from 'fastify';
import {
  adminListCampaigns,
  adminGetCampaign,
  adminCreateCampaign,
  adminUpdateCampaign,
  adminDeleteCampaign,
} from './admin-campaigns.controller.js';

export default async function adminCampaignRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return adminListCampaigns(fastify, request.query as Record<string, string>);
  });

  fastify.post('/', async (request) => {
    return adminCreateCampaign(fastify, request.body);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return adminGetCampaign(fastify, request.params.id);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    return adminUpdateCampaign(fastify, request.params.id, request.body);
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request) => {
    return adminDeleteCampaign(fastify, request.params.id);
  });
}
