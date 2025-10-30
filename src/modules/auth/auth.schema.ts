import { z } from 'zod';
import { registry } from '@common/openapi';

// ---- Request bodies
export const authNonceBody = z.object({
  address: z.string().min(32).openapi({ example: '7qcN6MTPGKQqmuNGLjZH4piu3BG22hF3jfDQZBm2KX5v' })
}).openapi('AuthNonceBody');

export const authVerifyBody = z.object({
  address: z.string().min(32).openapi({ example: 'm2KX5vTPGKQqmuNGLjZH4piu3BG22hF3jfDQZB7qcN6M' }),
  signature: z.string().min(10).openapi({ example: '4ZDjd6...G6K4iwL' })
}).openapi('AuthVerifyBody');

export const authRefreshBody = z.object({
  refresh: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
}).openapi('AuthRefreshBody');

export const authLogoutBody = z.object({
  refresh: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
}).openapi('AuthRefreshBody');

export const authRefreshSuccess = z.object({
  ok: z.literal(true),
  data: z.object({
    access: z.string().openapi({
      description: 'New short-lived access JWT',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....'
    }),
  })
}).openapi('AuthRefreshSuccess');

export const authLogoutSuccess = z.object({
  ok: z.literal(true)
}).openapi('AuthLogoutSuccess');

// ---- Common responses
const okNonceResponse = z.object({
  ok: z.literal(true),
  data: z.object({
    message: z.string().openapi({
      description: 'Canonical SIWS message to sign (server-generated).'
    })
  })
}).openapi('AuthNonceResponse');

const okVerifyResponse = z.object({
  ok: z.literal(true),
  data: z.object({
    access: z.string().openapi({ description: 'JWT access token (Bearer).' }),
    refresh: z.string().openapi({ description: 'JWT refresh token.' })
  })
}).openapi('AuthVerifyResponse');

const errorResponse = z.object({
  ok: z.literal(false),
  error: z.object({
    message: z.string()
  })
}).openapi('ErrorResponse');

// ---- Paths
registry.registerPath({
  method: 'post',
  path: '/auth/nonce',
  tags: ['Auth'],
  summary: 'Request a SIWS challenge',
  description: 'Returns a canonical “Sign-In With Solana” message including nonce and expiry. The client must sign this exact message.',
  request: {
    body: {
      content: { 'application/json': { schema: authNonceBody } }
    }
  },
  responses: {
    200: {
      description: 'Challenge created',
      content: { 'application/json': { schema: okNonceResponse } }
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: errorResponse } } }
  }
});

registry.registerPath({
  method: 'post',
  path: '/auth/verify',
  tags: ['Auth'],
  summary: 'Verify SIWS signature and issue tokens',
  description: 'Verifies the signature of the previously issued canonical message and returns JWT access/refresh tokens.',
  request: {
    body: {
      content: { 'application/json': { schema: authVerifyBody } }
    }
  },
  responses: {
    200: {
      description: 'Signature valid; tokens issued',
      content: { 'application/json': { schema: okVerifyResponse } }
    },
    400: { description: 'Challenge not found/expired or validation error', content: { 'application/json': { schema: errorResponse } } },
    401: { description: 'Invalid signature', content: { 'application/json': { schema: errorResponse } } }
  }
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Auth'],
  summary: 'Refresh access token',
  description: 'Refresh.',
  request: {
    body: {
      content: { 'application/json': { schema: authRefreshBody } }
    }
  },
  responses: {
    200: {
      description: 'New access token issued (and refresh rotated).',
      content: { 'application/json': { schema: authRefreshSuccess } }
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: errorResponse } } },
    401: {
      description: 'Missing/invalid refresh token',
      content: { 'application/json': { schema: errorResponse } }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Logout',
  description: 'Make refresh token expired and end session.',
  request: {
    body: {
      content: { 'application/json': { schema: authLogoutBody } }
    }
  },
  responses: {
    200: {
      description: 'Logged out',
      content: { 'application/json': { schema: authLogoutSuccess } }
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: errorResponse } } }
  }
});

// ---- Types for controller usage
export type AuthNonceBody = z.infer<typeof authNonceBody>;
export type AuthVerifyBody = z.infer<typeof authVerifyBody>;
export type AuthRefreshBody = z.infer<typeof authRefreshBody>;
export type AuthLogoutBody = z.infer<typeof authLogoutBody>;
