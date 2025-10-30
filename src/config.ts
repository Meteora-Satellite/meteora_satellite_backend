import 'dotenv/config';
import { cleanEnv, str, num } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['local', 'development', 'production'], default: 'local' }),
  DOMAIN: str({ default: 'localhost' }),
  API_BASE: str({ default: 'localhost/api' }),
  FRONTEND_URL: str({ default: 'localhost' }),
  PORT: num({ default: 8080 }),
  MONGO_URI: str(),
  MONGO_DB: str({ default: 'meteora_satellite' }),
  CORS_ORIGIN: str({ default: '' }),
  LOG_LEVEL: str({ default: 'info' }),
  JWT_ACCESS_SECRET: str(),
  JWT_REFRESH_SECRET: str(),
  JWT_ACCESS_TTL: str({ default: '15m' }),
  JWT_REFRESH_TTL: str({ default: '30d' }),
  MASTER_KEY_B64: str(),
  CRYPTO_ALGORITHM: str({ choices: ["aes-128-gcm", "aes-192-gcm", "aes-256-gcm"]}),
  SOLANA_RPC_URL: str({ default: 'https://api.mainnet-beta.solana.com' }),
  SOLANA_RPC_WEBHOOK_URL: str(),
  HELIUS_RPC_URL: str(),
  JUPITER_API_KEY: str(),
  JITO_BE_URLS: str(),
});
