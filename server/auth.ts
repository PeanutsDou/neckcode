import { randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { getDb } from './db';
import { AppError, ErrorCodes } from './errors';
import { logger } from './logger';
import type { JwtPayload, PublicUser, RegisterPayload } from './types';

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

// ─── 密码哈希 ───

function hashPassword(password: string): string {
  const salt = randomUUID();
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `${salt}:${derived.toString('hex')}`;
}

function verifyPassword(password: string, hash: string): boolean {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;
  try {
    const derived = scryptSync(password, salt, KEY_LENGTH);
    const keyBuffer = Buffer.from(key, 'hex');
    return keyBuffer.length === derived.length && timingSafeEqual(derived, keyBuffer);
  } catch {
    return false;
  }
}

// ─── JWT ───

function signToken(userId: string, username: string): { token: string; expiresAt: number } {
  const payload: JwtPayload = { userId, username };
  const expiresIn = config.tokenExpiresIn;
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn } as jwt.SignOptions);

  // 计算过期时间戳
  const decoded = jwt.decode(token) as { exp: number } | null;
  const expiresAt = decoded?.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

  return { token, expiresAt };
}

export function verifyToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    if (!payload.userId || !payload.username) {
      throw new AppError(ErrorCodes.TOKEN_INVALID, '登录已过期，请重新登录');
    }
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(ErrorCodes.TOKEN_INVALID, '登录已过期，请重新登录');
  }
}

// ─── 注册 ───

export function register(payload: RegisterPayload): { userId: string; username: string; displayName: string; token: string; expiresAt: number } {
  const db = getDb();
  const { username, password, displayName } = payload;

  // 检查用户名是否已存在
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    throw new AppError(ErrorCodes.USERNAME_EXISTS, '用户名已存在');
  }

  const userId = randomUUID();
  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name)
    VALUES (?, ?, ?, ?)
  `).run(userId, username, passwordHash, displayName);

  const { token, expiresAt } = signToken(userId, username);

  logger.info('User registered', { userId, username });

  return { userId, username, displayName, token, expiresAt };
}

// ─── 用户名密码登录 ───

export function login(payload: { username: string; password: string }): { userId: string; username: string; displayName: string; token: string; expiresAt: number } {
  const db = getDb();
  const { username, password } = payload;

  const row = db.prepare('SELECT id, username, password_hash, display_name FROM users WHERE username = ?').get(username) as {
    id: string; username: string; password_hash: string; display_name: string;
  } | undefined;

  if (!row) {
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, '用户名或密码错误');
  }

  if (!verifyPassword(password, row.password_hash)) {
    logger.warn('Login failed: invalid password', { username });
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, '用户名或密码错误');
  }

  const { token, expiresAt } = signToken(row.id, row.username);

  logger.info('User logged in', { userId: row.id, username });

  return { userId: row.id, username: row.username, displayName: row.display_name, token, expiresAt };
}

// ─── Token 登录 ───

export function loginWithToken(token: string): { userId: string; username: string; displayName: string; token: string; expiresAt: number } {
  const db = getDb();
  const payload = verifyToken(token);

  const row = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(payload.userId) as {
    id: string; username: string; display_name: string;
  } | undefined;

  if (!row) {
    throw new AppError(ErrorCodes.TOKEN_INVALID, '用户不存在');
  }

  // 签发新 token
  const { token: newToken, expiresAt } = signToken(row.id, row.username);

  logger.info('User logged in via token', { userId: row.id, username: row.username });

  return { userId: row.id, username: row.username, displayName: row.display_name, token: newToken, expiresAt };
}

// ─── 获取用户公开信息 ───

export function getUserPublic(userId: string): PublicUser | null {
  const db = getDb();
  const row = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(userId) as {
    id: string; username: string; display_name: string; avatar: string | null;
  } | undefined;
  if (!row) return null;
  return { userId: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar };
}
