import { z } from 'zod';
import { registry } from '@common/openapi';

export const walletBalancesData = z.object({
  solana: z.string().openapi({
    description: 'SOL balance as a decimal string (in SOL)',
    example: '1.23456789'
  }),
  tokens: z
    .record(
      z.string(), // token account pubkey
      z.string()  // uiAmountString
    )
    .openapi({
      description: 'Map of token account pubkey → uiAmountString (human-readable token amount)',
      example: {
        'H9f1...abc': '12.3456',
        '8xQk...xyz': '0.000001'
      }
    })
}).openapi('WalletBalancesData');

export const walletBalancesResponse = z.object({
  ok: z.literal(true),
  data: walletBalancesData
}).openapi('WalletBalancesResponse');

export const errorResponse = z.object({
  ok: z.literal(false),
  error: z.object({ message: z.string() })
}).openapi('ErrorResponse');

registry.registerPath({
  method: 'get',
  path: '/wallets/balances',
  tags: ['Wallets'],
  summary: "Get SOL and SPL token balances for user's custodial wallet",
  description: "Returns native SOL balance and all non-zero SPL token balances for the user's custodial wallet address.",
  responses: {
    200: {
      description: 'Balances fetched successfully',
      content: {
        'application/json': { schema: walletBalancesResponse }
      }
    },
    400: {
      description: 'Invalid address or validation error',
      content: { 'application/json': { schema: errorResponse } }
    },
    500: {
      description: 'Server/RPC error',
      content: { 'application/json': { schema: errorResponse } }
    }
  }
});

export type WalletBalancesResponse = z.infer<typeof walletBalancesResponse>;

export const walletPrivateKeyData = z.string().openapi('WalletPrivateKeyData');

export const walletPrivateKeyResponse = z.object({
  ok: z.literal(true),
  data: walletPrivateKeyData
}).openapi('WalletPrivateKeyResponse');

registry.registerPath({
  method: 'get',
  path: '/wallets/private-key',
  tags: ['Wallets'],
  summary: "Get user's custodial wallet's private key",
  description: "Return base58 encoded private key for the user's custodial wallet address.",
  responses: {
    200: {
      description: 'Private key fetched successfully',
      content: {
        'application/json': { schema: walletPrivateKeyResponse }
      }
    },
    400: {
      description: 'Invalid address or validation error',
      content: { 'application/json': { schema: errorResponse } }
    },
    500: {
      description: 'Server/RPC error',
      content: { 'application/json': { schema: errorResponse } }
    }
  }
});

export type WalletPrivateKeyResponse = z.infer<typeof walletBalancesResponse>;
