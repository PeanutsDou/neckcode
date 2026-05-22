import { randomUUID } from 'crypto';
import { getDb } from './db';
import { AppError, ErrorCodes } from './errors';
import type { MessagePayload, MsgType } from './types';
import { getUserPublic } from './auth';
import { logger } from './logger';

export interface SendMessageResult {
  messageId: string;
  toUser: string;
  content: string;
  msgType: MsgType;
  createdAt: number;
}

function validateMessage(fromUserId: string, toUserId: string, content: string, msgType: string): void {
  const db = getDb();

  if (!getUserPublic(toUserId)) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }
  if (!content || content.trim().length === 0) {
    throw new AppError(ErrorCodes.MESSAGE_EMPTY, '消息内容不能为空');
  }
  if (content.length > 4000) {
    throw new AppError(ErrorCodes.MESSAGE_TOO_LONG, '消息内容过长，最多 4000 字符');
  }
  if (msgType !== 'text') {
    throw new AppError(ErrorCodes.BAD_REQUEST, '当前仅支持 text 消息');
  }

  const relation = db.prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'"
  ).get(fromUserId, toUserId) as { status: string } | undefined;

  if (!relation) {
    throw new AppError(ErrorCodes.NOT_FRIEND, '只能给好友发送消息');
  }
}

export function sendMessage(
  fromUserId: string,
  fromUsername: string,
  toUserId: string,
  content: string,
  msgType: string = 'text'
): SendMessageResult {
  validateMessage(fromUserId, toUserId, content, msgType);

  const messageId = randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  logger.info('Message accepted', { messageId, from: fromUserId, fromUsername, to: toUserId });
  return {
    messageId,
    toUser: toUserId,
    content,
    msgType: msgType as MsgType,
    createdAt,
  };
}

export function queueOfflineMessage(msg: {
  messageId: string;
  fromUser: string;
  toUser: string;
  content: string;
  msgType: MsgType;
  createdAt: number;
}): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO direct_messages (id, from_user, to_user, content, msg_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(msg.messageId, msg.fromUser, msg.toUser, msg.content, msg.msgType, msg.createdAt);
  logger.info('Queued offline message', { messageId: msg.messageId, from: msg.fromUser, to: msg.toUser });
}

export function getOfflineMessages(userId: string): MessagePayload[] {
  const rows = getDb().prepare(`
    SELECT dm.id, dm.from_user, dm.to_user, dm.content, dm.msg_type, dm.created_at,
           u.display_name as from_name
    FROM direct_messages dm
    JOIN users u ON u.id = dm.from_user
    WHERE dm.to_user = ? AND dm.delivered_at IS NULL
    ORDER BY dm.created_at ASC
  `).all(userId) as Array<{
    id: string;
    from_user: string;
    to_user: string;
    content: string;
    msg_type: string;
    created_at: number;
    from_name: string;
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

export function markDelivered(messageIds: string[]): void {
  if (messageIds.length === 0) return;
  const placeholders = messageIds.map(() => '?').join(',');
  getDb().prepare(`DELETE FROM direct_messages WHERE id IN (${placeholders})`).run(...messageIds);
}

export function getHistory(
  currentUserId: string,
  peerUserId: string,
  before?: number,
  limit: number = 30
): MessagePayload[] {
  validateHistoryAccess(currentUserId, peerUserId);
  void before;
  void limit;
  return [];
}

function validateHistoryAccess(currentUserId: string, peerUserId: string): void {
  if (!getUserPublic(peerUserId)) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  const relation = getDb().prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'"
  ).get(currentUserId, peerUserId) as { status: string } | undefined;

  if (!relation) {
    throw new AppError(ErrorCodes.NOT_FRIEND, '只能查看好友的本地历史');
  }
}

export function markRead(currentUserId: string, messageId: string): { messageId: string; readAt: number; fromUser: string } {
  const readAt = Math.floor(Date.now() / 1000);
  return { messageId, readAt, fromUser: currentUserId };
}
