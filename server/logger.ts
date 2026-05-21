/* 统一日志封装，Stage 1-2 用 console */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

function now(): string {
  return new Date().toISOString();
}

function maskToken(token: string): string {
  if (token.length <= 8) return '***';
  return token.slice(0, 4) + '...' + token.slice(-4);
}

export const logger = {
  info(msg: string, meta?: Record<string, unknown>) {
    const safe = meta ? sanitize(meta) : '';
    console.log(`[${now()}] INFO  ${msg}`, safe);
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    const safe = meta ? sanitize(meta) : '';
    console.warn(`[${now()}] WARN  ${msg}`, safe);
  },
  error(msg: string, meta?: Record<string, unknown>) {
    const safe = meta ? sanitize(meta) : '';
    console.error(`[${now()}] ERROR ${msg}`, safe);
  },
};

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'password' || k === 'passwordHash' || k === 'jwtSecret') {
      result[k] = '***';
    } else if (k === 'token' && typeof v === 'string') {
      result[k] = maskToken(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}
