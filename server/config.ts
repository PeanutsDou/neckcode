import { randomBytes } from 'crypto';
import { resolve } from 'path';

export interface ServerConfig {
  host: string;
  port: number;
  dbPath: string;
  jwtSecret: string;
  tokenExpiresIn: string;
  maxMessageLength: number;
  maxQueryLength: number;
  rateLimitPerSec: number;
  heartbeatTimeoutMs: number;
  historyLimitMax: number;
}

function loadConfig(): ServerConfig {
  const port = parseInt(process.env.IM_PORT || '7654', 10);
  const host = process.env.IM_HOST || '0.0.0.0';
  const dbPath = process.env.IM_DB_PATH || resolve(__dirname, 'data', 'im-server.db');
  const jwtSecret = process.env.IM_JWT_SECRET || randomBytes(32).toString('hex');
  const tokenExpiresIn = process.env.IM_TOKEN_EXPIRES_IN || '30d';
  const maxMessageLength = parseInt(process.env.IM_MAX_MESSAGE_LENGTH || '4000', 10);
  const maxQueryLength = parseInt(process.env.IM_MAX_QUERY_LENGTH || '64', 10);
  const rateLimitPerSec = parseInt(process.env.IM_RATE_LIMIT_PER_SEC || '20', 10);
  const heartbeatTimeoutMs = parseInt(process.env.IM_HEARTBEAT_TIMEOUT_MS || '90000', 10);
  const historyLimitMax = parseInt(process.env.IM_HISTORY_LIMIT_MAX || '100', 10);

  return {
    host,
    port,
    dbPath,
    jwtSecret,
    tokenExpiresIn,
    maxMessageLength,
    maxQueryLength,
    rateLimitPerSec,
    heartbeatTimeoutMs,
    historyLimitMax,
  };
}

export const config = loadConfig();
