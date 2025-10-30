import pino from 'pino';
import { env } from '@config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const wantPretty =
  env.NODE_ENV !== 'production' &&
  (process.env.LOG_PRETTY ?? 'true') !== 'false';

let transportOpt: any | undefined;
if (wantPretty) {
  try {
    require.resolve('pino-pretty');
    transportOpt = {
      target: 'pino-pretty',
      options: {
        // human-friendly local time in pretty output
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l o',
        singleLine: true
      }
    };
  } catch {
    transportOpt = undefined;
  }
}

export const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime, // e.g., "2025-10-12T15:47:22.314Z"
  ...(transportOpt ? { transport: transportOpt } : {})
});
