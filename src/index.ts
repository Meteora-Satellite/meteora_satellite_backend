import { env } from '@config';
import { logger } from '@lib/logger';
import { connectMongo, disconnectMongo } from '@lib/mongo';
import { createApp } from './app';
import { startWebhooks } from './webhooks/index';

async function main() {
  await connectMongo();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`API on :${env.PORT}`));
  await startWebhooks();

  const shutdown = async (sig: string) => {
    logger.warn({ sig }, 'Shutting down...');
    server.close(() => logger.info('HTTP closed'));
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (e) => logger.error(e, 'unhandledRejection'));
  process.on('uncaughtException', (e) => { logger.error(e, 'uncaughtException'); process.exit(1); });
}

main();
