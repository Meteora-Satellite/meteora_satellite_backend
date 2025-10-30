import { z } from 'zod';
import { registry } from '@common/openapi';

export const custodialAddressResponse = z.object({
  ok: z.literal(true),
  data: z.object({
    address: z.string().openapi({ description: 'Wallet public key (base58)' })
  })
}).openapi('WalletAddressResponse');

export const errorResponse = z.object({
  ok: z.literal(false),
  error: z.object({ message: z.string() })
}).openapi('ErrorResponse');

registry.registerPath({
  method: 'get',
  path: '/users/wallet',
  tags: ['Users'],
  summary: 'Get wallet address',
  description: 'Returns the primary custodial (system-managed) wallet address for the authenticated user.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Custodial address found',
      content: { 'application/json': { schema: custodialAddressResponse } }
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponse } }
    },
  }
});
