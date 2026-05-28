import { randomUUID } from 'crypto';
import { getDb } from './db';
import { AppError, ErrorCodes } from './errors';
import type { MessageAttachment, MessagePayload, MsgType } from './types';
import { getUserPublic } from './auth';
import { logger } from './logger';

export interface SendMessageResult {
  messageId: string;
  toUser: string;
  content: string;
  msgType: MsgType;
  createdAt: number;
  attachments: MessageAttachment[];
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function sanitizeAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ATTACHMENTS).map((item): MessageAttachment | null => {
    if (!item || typeof item !== 'object') return null;
    const source = item as Record<string, unknown>;
    const type = source.type === 'image' ? 'image' : null;
    const data = typeof source.data === 'string' ? source.data : '';
    const mimeType = typeof source.mimeType === 'string' ? source.mimeType : '';
    const size = typeof source.size === 'number' ? source.size : undefined;
    if (!type || !data.startsWith('data:image/') || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return null;
    if (size && size > MAX_IMAGE_BYTES) return null;
    return {
      id: typeof source.id === 'string' ? source.id : undefined,
      type,
      data,
      mimeType,
      name: typeof source.name === 'string' ? source.name.slice(0, 120) : undefined,
      size,
    };
  }).filter((item): item is MessageAttachment => item !== null);
}

function parseAttachments(raw: string | null | undefined): MessageAttachment[] {
  if (!raw) return [];
  try {
    return sanitizeAttachments(JSON.parse(raw));
  } catch {
    return [];
  }
}

function validateMessage(fromUserId: string, toUserId: string, content: string, msgType: string, attachments: MessageAttachment[]): void {
  const db = getDb();

  if (!getUserPublic(toUserId)) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found');
  }
  if ((!content || content.trim().length === 0) && attachments.length === 0) {
    throw new AppError(ErrorCodes.MESSAGE_EMPTY, 'Message is empty');
  }
  if (content.length > 4000) {
    throw new AppError(ErrorCodes.MESSAGE_TOO_LONG, 'Message is too long');
  }
  if (msgType !== 'text') {
    throw new AppError(ErrorCodes.BAD_REQUEST, 'Only text messages are supported');
  }

  const relation = db.prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'"
  ).get(fromUserId, toUserId) as { status: string } | undefined;

  if (!relation) {
    throw new AppError(ErrorCodes.NOT_FRIEND, 'Can only message accepted friends');
  }
}

export function sendMessage(
  fromUserId: string,
  fromUsername: string,
  toUserId: string,
  content: string,
  msgType: string = 'text',
  rawAttachments?: unknown,
): SendMessageResult {
  const attachments = sanitizeAttachments(rawAttachments);
  validateMessage(fromUserId, toUserId, content, msgType, attachments);

  const messageId = randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  logger.info('Message accepted', { messageId, from: fromUserId, fromUsername, to: toUserId, attachmentCount: attachments.length });
  return {
    messageId,
    toUser: toUserId,
    content,
    msgType: msgType as MsgType,
    createdAt,
    attachments,
  };
}

export function queueOfflineMessage(msg: {
  messageId: string;
  fromUser: string;
  toUser: string;
  content: string;
  msgType: MsgType;
  createdAt: number;
  attachments?: MessageAttachment[];
}): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO direct_messages (id, from_user, to_user, content, msg_type, created_at, attachments_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(msg.messageId, msg.fromUser, msg.toUser, msg.content, msg.msgType, msg.createdAt, JSON.stringify(msg.attachments || []));
  logger.info('Queued offline message', { messageId: msg.messageId, from: msg.fromUser, to: msg.toUser });
}

export function getOfflineMessages(userId: string): MessagePayload[] {
  const rows = getDb().prepare(`
    SELECT dm.id, dm.from_user, dm.to_user, dm.content, dm.msg_type, dm.created_at, dm.attachments_json,
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
    attachments_json?: string | null;
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
    attachments: parseAttachments(row.attachments_json),
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
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found');
  }

  const relation = getDb().prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'"
  ).get(currentUserId, peerUserId) as { status: string } | undefined;

  if (!relation) {
    throw new AppError(ErrorCodes.NOT_FRIEND, 'Can only view accepted friend history');
  }
}

export function markRead(currentUserId: string, messageId: string): { messageId: string; readAt: number; fromUser: string } {
  const readAt = Math.floor(Date.now() / 1000);
  return { messageId, readAt, fromUser: currentUserId };
}
