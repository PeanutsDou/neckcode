import { randomUUID } from 'crypto';
import { getDb } from './db';
import { AppError, ErrorCodes } from './errors';
import type { MessagePayload, MsgType } from './types';
import { getUserPublic } from './auth';
import { logger } from './logger';

// ─── 发送消息 ───

export interface SendMessageResult {
  messageId: string;
  toUser: string;
  content: string;
  msgType: MsgType;
  createdAt: number;
}

export function sendMessage(
  fromUserId: string,
  fromUsername: string,
  toUserId: string,
  content: string,
  msgType: string = 'text'
): SendMessageResult {
  const db = getDb();

  // 校验接收方存在
  const target = getUserPublic(toUserId);
  if (!target) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  // 校验内容
  const trimmed = content;
  if (!trimmed || trimmed.trim().length === 0) {
    throw new AppError(ErrorCodes.MESSAGE_EMPTY, '消息内容不能为空');
  }
  if (trimmed.length > 4000) {
    throw new AppError(ErrorCodes.MESSAGE_TOO_LONG, '消息内容过长（最多 4000 字符）');
  }

  // 校验 msgType
  if (msgType !== 'text') {
    throw new AppError(ErrorCodes.BAD_REQUEST, 'Phase 1 仅支持 text 消息');
  }

  // 校验好友关系
  const relation = db.prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'"
  ).get(fromUserId, toUserId) as { status: string } | undefined;

  if (!relation) {
    throw new AppError(ErrorCodes.NOT_FRIEND, '只能给好友发送消息');
  }

  const messageId = randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO direct_messages (id, from_user, to_user, content, msg_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(messageId, fromUserId, toUserId, content, msgType, createdAt);

  logger.info('Message sent', { messageId, from: fromUserId, to: toUserId });

  return {
    messageId,
    toUser: toUserId,
    content,
    msgType: msgType as MsgType,
    createdAt,
  };
}

// ─── 离线消息查询 ───

export function getOfflineMessages(userId: string): MessagePayload[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT dm.id, dm.from_user, dm.to_user, dm.content, dm.msg_type, dm.created_at,
           u.display_name as from_name
    FROM direct_messages dm
    JOIN users u ON u.id = dm.from_user
    WHERE dm.to_user = ? AND dm.delivered_at IS NULL
    ORDER BY dm.created_at ASC
  `).all(userId) as Array<{
    id: string; from_user: string; to_user: string; content: string;
    msg_type: string; created_at: number; from_name: string;
  }>;

  return rows.map((row) => ({
    messageId: row.id,
    fromUser: row.from_user,
    fromName: row.from_name,
    toUser: row.to_user,
    content: row.content,
    msgType: row.msg_type as MsgType,
    createdAt: row.created_at,
  }));
}

// ─── 批量标记已送达 ───

export function markDelivered(messageIds: string[]): void {
  if (messageIds.length === 0) return;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const placeholders = messageIds.map(() => '?').join(',');

  db.prepare(`
    UPDATE direct_messages SET delivered_at = ? WHERE id IN (${placeholders})
  `).run(now, ...messageIds);
}

// ─── 拉取历史消息 ───

export function getHistory(
  currentUserId: string,
  peerUserId: string,
  before?: number,
  limit: number = 30
): MessagePayload[] {
  const db = getDb();

  // 校验 peerUser 存在
  const peer = getUserPublic(peerUserId);
  if (!peer) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  // 校验好友关系
  const relation = db.prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'"
  ).get(currentUserId, peerUserId) as { status: string } | undefined;

  if (!relation) {
    throw new AppError(ErrorCodes.NOT_FRIEND, '只能查看好友的历史消息');
  }

  // 归一化 limit
  if (limit < 1 || limit > 100) limit = 30;

  let rows: Array<{
    id: string; from_user: string; to_user: string; content: string;
    msg_type: string; created_at: number; delivered_at: number | null; read_at: number | null;
    from_name: string;
  }>;

  if (before) {
    rows = db.prepare(`
      SELECT dm.*, u.display_name as from_name
      FROM direct_messages dm
      JOIN users u ON u.id = dm.from_user
      WHERE ((dm.from_user = ? AND dm.to_user = ?) OR (dm.from_user = ? AND dm.to_user = ?))
        AND dm.created_at < ?
      ORDER BY dm.created_at DESC
      LIMIT ?
    `).all(currentUserId, peerUserId, peerUserId, currentUserId, before, limit) as typeof rows;
  } else {
    rows = db.prepare(`
      SELECT dm.*, u.display_name as from_name
      FROM direct_messages dm
      JOIN users u ON u.id = dm.from_user
      WHERE (dm.from_user = ? AND dm.to_user = ?) OR (dm.from_user = ? AND dm.to_user = ?)
      ORDER BY dm.created_at DESC
      LIMIT ?
    `).all(currentUserId, peerUserId, peerUserId, currentUserId, limit) as typeof rows;
  }

  // 反转回 ASC 顺序
  rows.reverse();

  return rows.map((row) => ({
    messageId: row.id,
    fromUser: row.from_user,
    fromName: row.from_name,
    toUser: row.to_user,
    content: row.content,
    msgType: row.msg_type as MsgType,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
  }));
}

// ─── 标记已读 ───

export function markRead(currentUserId: string, messageId: string): { messageId: string; readAt: number; fromUser: string } {
  const db = getDb();

  const msg = db.prepare('SELECT id, from_user, to_user, read_at FROM direct_messages WHERE id = ?').get(messageId) as {
    id: string; from_user: string; to_user: string; read_at: number | null;
  } | undefined;

  if (!msg) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '消息不存在');
  }

  if (msg.to_user !== currentUserId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, '只能标记自己收到的消息已读');
  }

  if (msg.read_at) {
    // 已读过，返回原有 read_at
    return { messageId, readAt: msg.read_at, fromUser: msg.from_user };
  }

  const readAt = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE direct_messages SET read_at = ? WHERE id = ?').run(readAt, messageId);

  return { messageId, readAt, fromUser: msg.from_user };
}
