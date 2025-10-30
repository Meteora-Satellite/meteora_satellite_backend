import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export function buildOpenApi(opts?: { title?: string; version?: string; serverUrl?: string }) {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: opts?.title ?? 'Meteora Satellite API',
      version: opts?.version ?? '0.1.0'
    },
    servers: [{ url: opts?.serverUrl ?? 'http://localhost:8080/api' }],
    // @ts-ignore
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste: Bearer <access token>',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  });
}
