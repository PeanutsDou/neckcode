import type { ImClientError } from '../../shared/im-types';

export function normalizeError(err: unknown): ImClientError {
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err && 'source' in err) {
    return err as ImClientError;
  }

  if (err instanceof Error) {
    // WebSocket error / network error
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      return { code: 'SERVER_UNAVAILABLE', message: '无法连接 IM 服务', source: 'network', retryable: true };
    }
    if (err.message.includes('timeout')) {
      return { code: 'REQUEST_TIMEOUT', message: '请求超时，请重试', source: 'network', retryable: true };
    }
    return { code: 'CLIENT_ERROR', message: err.message, source: 'client', retryable: false };
  }

  return { code: 'UNKNOWN', message: String(err), source: 'client', retryable: false };
}

export function serverErrorToClient(code: string, message: string): ImClientError {
  const retryable = ['RATE_LIMITED', 'INTERNAL_ERROR', 'SERVER_UNAVAILABLE'].includes(code);
  return { code, message, source: 'server', retryable };
}

export function cacheError(message: string): ImClientError {
  return { code: 'CACHE_WRITE_FAILED', message, source: 'cache', retryable: true };
}

export function badRequestError(message: string): ImClientError {
  return { code: 'BAD_REQUEST', message, source: 'client', retryable: false };
}

export function networkError(message: string): ImClientError {
  return { code: 'SERVER_UNAVAILABLE', message, source: 'network', retryable: true };
}
