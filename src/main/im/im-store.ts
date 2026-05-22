import { getDb } from '../session-store';
import type {
  ImFriend,
  ImFriendRequest,
  ImMessage,
  ImConversation,
  ImUser,
  ImMessageStatus,
} from '../../shared/im-types';

export function initImStore(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS im_local_user (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      token TEXT NOT NULL,
      token_expires_at INTEGER NOT NULL,
      server_url TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS im_friends (
      owner_user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      status TEXT NOT NULL,
      online INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS im_friend_requests (
      owner_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_user_id, user_id, direction)
    );

    CREATE TABLE IF NOT EXISTS im_direct_messages (
      owner_user_id TEXT NOT NULL,
      local_id TEXT,
      message_id TEXT,
      peer_user_id TEXT NOT NULL,
      from_user TEXT NOT NULL,
      to_user TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      content TEXT NOT NULL,
      msg_type TEXT NOT NULL DEFAULT 'text',
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
      created_at INTEGER NOT NULL,
      delivered_at INTEGER,
      read_at INTEGER,
      local_created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_user_id, local_id)
    );

    CREATE INDEX IF NOT EXISTS idx_im_dm_peer_created ON im_direct_messages(owner_user_id, peer_user_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_im_dm_message_id
      ON im_direct_messages(owner_user_id, message_id)
      WHERE message_id IS NOT NULL AND message_id != '';

    CREATE TABLE IF NOT EXISTS im_conversations (
      owner_user_id TEXT NOT NULL,
      peer_user_id TEXT NOT NULL,
      peer_username TEXT NOT NULL,
      peer_display_name TEXT NOT NULL,
      last_message_preview TEXT,
      last_message_at INTEGER,
      unread_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_user_id, peer_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_im_conv_updated ON im_conversations(owner_user_id, updated_at DESC);
  `);
}

export function getLocalUser(): (ImUser & { token: string; tokenExpiresAt: number; serverUrl: string }) | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM im_local_user LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    userId: row.user_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatar: row.avatar as string | null,
    token: row.token as string,
    tokenExpiresAt: row.token_expires_at as number,
    serverUrl: row.server_url as string,
  };
}

export function saveLocalUser(user: { userId: string; username: string; displayName: string; avatar?: string | null; token: string; tokenExpiresAt: number; serverUrl: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO im_local_user (user_id, username, display_name, avatar, token, token_expires_at, server_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      avatar = excluded.avatar,
      token = excluded.token,
      token_expires_at = excluded.token_expires_at,
      server_url = excluded.server_url,
      updated_at = excluded.updated_at
  `).run(user.userId, user.username, user.displayName, user.avatar || null, user.token, user.tokenExpiresAt, user.serverUrl, Date.now());
}

export function clearLocalUser(): void {
  getDb().prepare('DELETE FROM im_local_user').run();
}

export function upsertFriends(ownerUserId: string, friends: ImFriend[]): void {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO im_friends (owner_user_id, friend_id, username, display_name, avatar, status, online, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, friend_id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      avatar = excluded.avatar,
      status = excluded.status,
      online = excluded.online,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const f of friends) {
      stmt.run(ownerUserId, f.userId, f.username, f.displayName, f.avatar, f.status, f.online ? 1 : 0, f.lastSeenAt, now);
      removeFriendRequest(ownerUserId, f.userId);
      upsertConversation(ownerUserId, f.userId, f.username, f.displayName, { unreadDelta: 0 });
    }
  });
  tx();
}

export function removeFriend(ownerUserId: string, friendId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM im_friends WHERE owner_user_id = ? AND friend_id = ?').run(ownerUserId, friendId);
    db.prepare('DELETE FROM im_friend_requests WHERE owner_user_id = ? AND user_id = ?').run(ownerUserId, friendId);
    db.prepare('DELETE FROM im_conversations WHERE owner_user_id = ? AND peer_user_id = ?').run(ownerUserId, friendId);
  });
  tx();
}

export function listCachedFriends(ownerUserId: string): ImFriend[] {
  const rows = getDb().prepare('SELECT * FROM im_friends WHERE owner_user_id = ? ORDER BY updated_at DESC')
    .all(ownerUserId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    userId: r.friend_id as string,
    username: r.username as string,
    displayName: r.display_name as string,
    avatar: r.avatar as string | null,
    status: 'accepted',
    online: Boolean(r.online),
    lastSeenAt: r.last_seen_at as number | null,
  }));
}

export function upsertFriendRequest(ownerUserId: string, request: ImFriendRequest): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO im_friend_requests (owner_user_id, user_id, username, display_name, avatar, direction, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, user_id, direction) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      avatar = excluded.avatar,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(ownerUserId, request.userId, request.username, request.displayName, request.avatar, request.direction, request.status, request.createdAt, now);
}

export function replaceFriendRequests(ownerUserId: string, requests: ImFriendRequest[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM im_friend_requests WHERE owner_user_id = ? AND status = 'pending'").run(ownerUserId);
    for (const request of requests) upsertFriendRequest(ownerUserId, request);
  });
  tx();
}

export function removeFriendRequest(ownerUserId: string, userId: string): void {
  getDb().prepare('DELETE FROM im_friend_requests WHERE owner_user_id = ? AND user_id = ?').run(ownerUserId, userId);
}

export function listFriendRequests(ownerUserId: string): ImFriendRequest[] {
  const rows = getDb().prepare("SELECT * FROM im_friend_requests WHERE owner_user_id = ? AND status = 'pending' ORDER BY created_at DESC")
    .all(ownerUserId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    userId: r.user_id as string,
    username: r.username as string,
    displayName: r.display_name as string,
    avatar: r.avatar as string | null,
    direction: r.direction as 'in' | 'out',
    status: 'pending',
    createdAt: r.created_at as number,
  }));
}

export function insertPendingMessage(ownerUserId: string, localId: string, peerUserId: string, fromUser: string, toUser: string, content: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO im_direct_messages (owner_user_id, local_id, message_id, peer_user_id, from_user, to_user, direction, content, msg_type, status, created_at, local_created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?, ?, 'out', ?, 'text', 'pending', ?, ?, ?)
  `).run(ownerUserId, localId, peerUserId, fromUser, toUser, content, Math.floor(now / 1000), now, now);
}

export function markMessageSent(ownerUserId: string, localId: string, messageId: string, createdAt: number): void {
  getDb().prepare(`
    UPDATE im_direct_messages
    SET message_id = ?, status = 'sent', created_at = ?, updated_at = ?
    WHERE owner_user_id = ? AND local_id = ?
  `).run(messageId, createdAt, Date.now(), ownerUserId, localId);
}

export function markMessageFailed(ownerUserId: string, localId: string): void {
  getDb().prepare("UPDATE im_direct_messages SET status = 'failed', updated_at = ? WHERE owner_user_id = ? AND local_id = ?")
    .run(Date.now(), ownerUserId, localId);
}

export function insertIncomingMessage(ownerUserId: string, msg: {
  messageId: string;
  fromUser: string;
  toUser: string;
  content: string;
  msgType?: string;
  createdAt: number;
  deliveredAt?: number | null;
  readAt?: number | null;
}): boolean {
  const db = getDb();
  const now = Date.now();
  const peerUserId = msg.fromUser === ownerUserId ? msg.toUser : msg.fromUser;
  const direction = msg.fromUser === ownerUserId ? 'out' : 'in';
  const localId = `svr:${msg.messageId}`;

  const info = db.prepare(`
    INSERT INTO im_direct_messages (
      owner_user_id, local_id, message_id, peer_user_id, from_user, to_user,
      direction, content, msg_type, status, created_at, delivered_at, read_at, local_created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, local_id) DO UPDATE SET
      message_id = excluded.message_id,
      content = excluded.content,
      status = excluded.status,
      delivered_at = excluded.delivered_at,
      read_at = excluded.read_at,
      updated_at = excluded.updated_at
  `).run(
    ownerUserId,
    localId,
    msg.messageId,
    peerUserId,
    msg.fromUser,
    msg.toUser,
    direction,
    msg.content,
    msg.msgType || 'text',
    msg.createdAt,
    msg.deliveredAt || null,
    msg.readAt || null,
    now,
    now,
  );
  return info.changes > 0;
}

export function listMessages(ownerUserId: string, peerUserId: string, limit = 50, before?: number): ImMessage[] {
  let rows: Array<Record<string, unknown>>;
  if (before) {
    rows = getDb().prepare(`
      SELECT * FROM im_direct_messages
      WHERE owner_user_id = ? AND peer_user_id = ? AND created_at < ?
      ORDER BY created_at DESC LIMIT ?
    `).all(ownerUserId, peerUserId, before, limit) as Array<Record<string, unknown>>;
  } else {
    rows = getDb().prepare(`
      SELECT * FROM im_direct_messages
      WHERE owner_user_id = ? AND peer_user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(ownerUserId, peerUserId, limit) as Array<Record<string, unknown>>;
  }
  return rows.reverse().map(rowToMessage);
}

function rowToMessage(row: Record<string, unknown>): ImMessage {
  return {
    localId: row.local_id as string | undefined,
    messageId: (row.message_id as string) || '',
    peerUserId: row.peer_user_id as string,
    fromUser: row.from_user as string,
    toUser: row.to_user as string,
    direction: row.direction as 'in' | 'out',
    content: row.content as string,
    msgType: row.msg_type as string,
    status: row.status as ImMessageStatus,
    createdAt: row.created_at as number,
    deliveredAt: row.delivered_at as number | null,
    readAt: row.read_at as number | null,
  };
}

export function getMessageByLocalId(ownerUserId: string, localId: string): ImMessage | null {
  const row = getDb().prepare('SELECT * FROM im_direct_messages WHERE owner_user_id = ? AND local_id = ?')
    .get(ownerUserId, localId) as Record<string, unknown> | undefined;
  return row ? rowToMessage(row) : null;
}

export function listPendingMessages(ownerUserId: string, limit = 100): ImMessage[] {
  const rows = getDb().prepare(`
    SELECT * FROM im_direct_messages
    WHERE owner_user_id = ? AND direction = 'out' AND status = 'pending'
    ORDER BY local_created_at ASC LIMIT ?
  `).all(ownerUserId, limit) as Array<Record<string, unknown>>;
  return rows.map(rowToMessage);
}

export function getFriend(ownerUserId: string, peerUserId: string): ImFriend | null {
  const row = getDb().prepare('SELECT * FROM im_friends WHERE owner_user_id = ? AND friend_id = ?')
    .get(ownerUserId, peerUserId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    userId: row.friend_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatar: row.avatar as string | null,
    status: 'accepted',
    online: Boolean(row.online),
    lastSeenAt: row.last_seen_at as number | null,
  };
}

export function upsertConversation(ownerUserId: string, peerUserId: string, peerUsername: string, peerDisplayName: string, patch: { lastMessagePreview?: string; lastMessageAt?: number; unreadDelta?: number }): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO im_conversations (
      owner_user_id, peer_user_id, peer_username, peer_display_name,
      last_message_preview, last_message_at, unread_count, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, MAX(0, ?), ?)
    ON CONFLICT(owner_user_id, peer_user_id) DO UPDATE SET
      peer_username = CASE WHEN excluded.peer_username != '' THEN excluded.peer_username ELSE im_conversations.peer_username END,
      peer_display_name = CASE WHEN excluded.peer_display_name != '' THEN excluded.peer_display_name ELSE im_conversations.peer_display_name END,
      last_message_preview = COALESCE(excluded.last_message_preview, im_conversations.last_message_preview),
      last_message_at = COALESCE(excluded.last_message_at, im_conversations.last_message_at),
      unread_count = MAX(0, im_conversations.unread_count + ?),
      updated_at = excluded.updated_at
  `).run(
    ownerUserId,
    peerUserId,
    peerUsername,
    peerDisplayName,
    patch.lastMessagePreview || null,
    patch.lastMessageAt || null,
    patch.unreadDelta || 0,
    now,
    patch.unreadDelta || 0,
  );
}

export function clearUnread(ownerUserId: string, peerUserId: string): void {
  getDb().prepare('UPDATE im_conversations SET unread_count = 0 WHERE owner_user_id = ? AND peer_user_id = ?')
    .run(ownerUserId, peerUserId);
}

export function listConversations(ownerUserId: string): ImConversation[] {
  const rows = getDb().prepare('SELECT * FROM im_conversations WHERE owner_user_id = ? ORDER BY updated_at DESC')
    .all(ownerUserId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    peerUserId: r.peer_user_id as string,
    peerUsername: r.peer_username as string,
    peerDisplayName: r.peer_display_name as string,
    lastMessagePreview: r.last_message_preview as string | null,
    lastMessageAt: r.last_message_at as number | null,
    unreadCount: r.unread_count as number,
  }));
}

export function updateFriendOnline(ownerUserId: string, friendId: string, online: boolean, lastSeenAt?: number): void {
  getDb().prepare('UPDATE im_friends SET online = ?, last_seen_at = ?, updated_at = ? WHERE owner_user_id = ? AND friend_id = ?')
    .run(online ? 1 : 0, lastSeenAt || null, Date.now(), ownerUserId, friendId);
}
