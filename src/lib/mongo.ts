import mongoose from 'mongoose';
import { logger } from '@lib/logger';
import { env } from '@config';

type ConnectOpts = {
  maxRetries?: number;
  retryDelayMs?: number;
};

export async function connectMongo(opts: ConnectOpts = {}) {
  const {
    maxRetries = 5,
    retryDelayMs = 1500
  } = opts;

  // Atlas defaults: TLS on, SRV discovery, retryable writes enabled by URI params
  const uri = env.MONGO_URI;
  const dbName = env.MONGO_DB;

  let attempt = 0;
  while (true) {
    try {
      mongoose.set('strictQuery', true);
      await mongoose.connect(uri, {
        dbName,
        // Reasonable timeouts for cloud DBs
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 20000,
        maxPoolSize: 20, // adjust per workload
        retryWrites: true // usually already in URI, harmless here
      } as any);

      wireConnectionLogging();
      logger.info({ dbName }, 'MongoDB Atlas connected');
      break;
    } catch (err: any) {
      attempt += 1;
      logger.error({ err, attempt }, 'Mongo connect failed');
      if (attempt >= maxRetries) {
        throw new Error(`Mongo failed to connect after ${maxRetries} attempts: ${err?.message || err}`);
      }
      await delay(retryDelayMs);
    }
  }
}

export async function disconnectMongo() {
  await mongoose.disconnect();
  logger.info('Mongo disconnected');
}

function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function wireConnectionLogging() {
  const conn = mongoose.connection;

  conn.on('connected', () => logger.debug('Mongo connected event'));
  conn.on('reconnected', () => logger.warn('Mongo reconnected'));
  conn.on('disconnected', () => logger.warn('Mongo disconnected event'));
  conn.on('error', (e) => logger.error({ e }, 'Mongo connection error'));
}
