import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApi } from '@common/openapi';
import { env } from '@config';
import { errorMiddleware } from '@lib/errors';

import healthRoutes from '@modules/health/routes';
import authRoutes from '@modules/auth/auth.routes';
import usersRoutes from '@modules/users/users.routes';
import positionsRoutes from '@modules/positions/positions.routes';
import walletsRoutes from '@modules/wallets/wallets.routes';
import notificationsRoutes from '@modules/notifications/notifications.routes';
import { authGuard } from '@common/auth-guard';
import { httpLogger } from "@common/httpLogger";

const allowedOrigins = env.CORS_ORIGIN
  .split(',')
  .map(s => s.trim().replace(/\/$/, '')) // strip trailing slash
  .filter(Boolean);

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Build OpenAPI after all schemas are registered/imported
  const openapiDoc = buildOpenApi({
    title: 'Meteora Satellite API',
    version: '0.1.0',
    serverUrl: env.API_BASE,
  });

  /** ---------- Docs FIRST (with route-local CSP override) ---------- */
  app.get('/openapi.json', (_req, res) => res.json(openapiDoc));

  app.use(
    ['/docs', '/docs/'],
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: false,
    })
  );

  app.use(
    '/docs',
    swaggerUi.serveFiles(openapiDoc, {
      swaggerOptions: { url: '/openapi.json', persistAuthorization: true },
    })
  );
  app.get(['/docs', '/docs/'], (_req, res) => {
    res.send(
      swaggerUi.generateHTML(openapiDoc, {
        explorer: true,
        swaggerOptions: { url: '/openapi.json', persistAuthorization: true },
      })
    );
  });
  /** ---------- End docs ---------- */

  // Global middleware
  app.use(
    helmet({
      hsts: false,
    })
  );

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const normalized = origin.replace(/\/$/, '');
      return allowedOrigins.includes(normalized)
        ? cb(null, true)
        : cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: false,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
  }));

  app.use(rateLimit({ windowMs: 60_000, max: 120 }));
  app.use(express.json({ limit: '1mb' }));
  app.use(httpLogger);


  // API routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', authGuard(), usersRoutes);
  app.use('/api/positions', authGuard(), positionsRoutes);
  app.use('/api/wallets', authGuard(), walletsRoutes);
  app.use("/api/notifications", authGuard(), notificationsRoutes);


  // 404 + error handler
  app.use((_req, res) => res.status(404).json({ ok: false, error: { message: 'Not Found' } }));
  app.use(errorMiddleware);

  return app;
}
