import type { FastifyInstance } from 'fastify';
import { listAddresses, createAddress, updateAddress, deleteAddress } from './company-addresses.controller.js';

export default async function companyAddressRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticateCompany);

  fastify.get('/', async (request) => {
    return listAddresses(fastify, request.user.id);
  });

  fastify.post('/', async (request) => {
    return createAddress(fastify, request.user.id, request.body);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    return updateAddress(fastify, request.user.id, request.params.id, request.body);
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request) => {
    return deleteAddress(fastify, request.user.id, request.params.id);
  });
}
