// ─── 业务错误 ───

export class AppError extends Error {
  code: string;
  publicMessage: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.publicMessage = message;
    this.details = details;
  }
}

// ─── 错误码 ───

export const ErrorCodes = {
  BAD_JSON: 'BAD_JSON',
  BAD_REQUEST: 'BAD_REQUEST',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  USERNAME_EXISTS: 'USERNAME_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CANNOT_ADD_SELF: 'CANNOT_ADD_SELF',
  FRIEND_ALREADY_EXISTS: 'FRIEND_ALREADY_EXISTS',
  FRIEND_REQUEST_EXISTS: 'FRIEND_REQUEST_EXISTS',
  FRIEND_REQUEST_NOT_FOUND: 'FRIEND_REQUEST_NOT_FOUND',
  NOT_FRIEND: 'NOT_FRIEND',
  MESSAGE_EMPTY: 'MESSAGE_EMPTY',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
