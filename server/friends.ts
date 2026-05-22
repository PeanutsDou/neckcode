import { getDb } from './db';
import { AppError, ErrorCodes } from './errors';
import type { FriendInfo, FriendRequestInfo, FriendStatus, SearchRelation, SearchUser } from './types';
import { getUserPublic } from './auth';

// ─── 搜索用户 ───

export function searchUsers(currentUserId: string, query: string): SearchUser[] {
  if (!query || query.trim().length === 0 || query.length > 64) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '搜索内容需 1-64 个字符');
  }

  const db = getDb();
  const q = `%${query.trim()}%`;

  const rows = db.prepare(`
    SELECT id, username, display_name, avatar FROM users
    WHERE username LIKE ? OR display_name LIKE ? OR id = ?
    ORDER BY
      CASE WHEN username = ? THEN 0 ELSE 1 END,
      CASE WHEN username LIKE ? THEN 0 ELSE 1 END
    LIMIT 20
  `).all(q, q, query.trim(), query.trim(), q + '%') as Array<{
    id: string; username: string; display_name: string; avatar: string | null;
  }>;

  return rows.map((row) => ({
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    relation: getRelation(currentUserId, row.id),
  }));
}

// ─── 获取两用户之间的关系 ───

function getRelation(currentUserId: string, targetUserId: string): SearchRelation {
  if (currentUserId === targetUserId) return 'self';

  const db = getDb();
  const row = db.prepare(
    'SELECT status FROM friends WHERE user_id = ? AND friend_id = ?'
  ).get(currentUserId, targetUserId) as { status: string } | undefined;

  if (!row) return 'none';

  switch (row.status) {
    case 'pending_sent': return 'pending_sent';
    case 'pending_received': return 'pending_received';
    case 'accepted': return 'accepted';
    case 'blocked': return 'blocked';
    default: return 'none';
  }
}

// ─── 添加好友 ───

export interface AddFriendResult {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: FriendStatus;
}

export function addFriend(currentUserId: string, targetUserId: string): AddFriendResult {
  if (currentUserId === targetUserId) {
    throw new AppError(ErrorCodes.CANNOT_ADD_SELF, '不能添加自己为好友');
  }

  const db = getDb();
  const target = getUserPublic(targetUserId);
  if (!target) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  // 检查当前关系
  const currentRelation = db.prepare(
    'SELECT status FROM friends WHERE user_id = ? AND friend_id = ?'
  ).get(currentUserId, targetUserId) as { status: string } | undefined;

  if (currentRelation) {
    if (currentRelation.status === 'accepted') {
      throw new AppError(ErrorCodes.FRIEND_ALREADY_EXISTS, '已经是好友');
    }
    if (currentRelation.status === 'pending_sent') {
      throw new AppError(ErrorCodes.FRIEND_REQUEST_EXISTS, '好友申请已发送');
    }
    if (currentRelation.status === 'pending_received') {
      // A 已收到 B 的申请 → A 添加 B 直接等价于接受
      const friendInfo = acceptFriendInternal(currentUserId, targetUserId);
      return {
        userId: friendInfo.userId,
        username: friendInfo.username,
        displayName: friendInfo.displayName,
        avatar: friendInfo.avatar,
        status: friendInfo.status,
      };
    }
    if (currentRelation.status === 'blocked') {
      throw new AppError(ErrorCodes.BAD_REQUEST, '用户已屏蔽');
    }
  }

  // 写入双向关系
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO friends (user_id, friend_id, status)
      VALUES (?, ?, 'pending_sent')
    `).run(currentUserId, targetUserId);

    db.prepare(`
      INSERT INTO friends (user_id, friend_id, status)
      VALUES (?, ?, 'pending_received')
    `).run(targetUserId, currentUserId);
  });

  tx();

  return {
    userId: target.userId,
    username: target.username,
    displayName: target.displayName,
    avatar: target.avatar,
    status: 'pending_sent',
  };
}

export interface RemoveFriendResult {
  userId: string;
}

export function removeFriend(currentUserId: string, targetUserId: string): RemoveFriendResult {
  if (currentUserId === targetUserId) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '不能删除自己');
  }

  const db = getDb();
  const relation = db.prepare(
    'SELECT status FROM friends WHERE user_id = ? AND friend_id = ?'
  ).get(currentUserId, targetUserId) as { status: string } | undefined;

  if (!relation) {
    throw new AppError(ErrorCodes.NOT_FRIEND, '好友关系不存在');
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(currentUserId, targetUserId);
    db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(targetUserId, currentUserId);
  });
  tx();

  return { userId: targetUserId };
}

// ─── 接受好友 ───

export interface AcceptFriendResult {
  friend: FriendInfo;
}

export function acceptFriend(currentUserId: string, targetUserId: string): AcceptFriendResult {
  if (currentUserId === targetUserId) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '不能接受自己');
  }

  return {
    friend: acceptFriendInternal(currentUserId, targetUserId),
  };
}

function acceptFriendInternal(currentUserId: string, targetUserId: string): FriendInfo {
  const db = getDb();

  const target = getUserPublic(targetUserId);
  if (!target) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  // 检查是否有 pending_received 的申请
  const request = db.prepare(
    "SELECT status FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending_received'"
  ).get(currentUserId, targetUserId) as { status: string } | undefined;

  if (!request) {
    throw new AppError(ErrorCodes.FRIEND_REQUEST_NOT_FOUND, '好友申请不存在');
  }

  // 事务更新两行为 accepted
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE friends SET status = 'accepted', updated_at = unixepoch()
      WHERE user_id = ? AND friend_id = ?
    `).run(currentUserId, targetUserId);

    db.prepare(`
      UPDATE friends SET status = 'accepted', updated_at = unixepoch()
      WHERE user_id = ? AND friend_id = ?
    `).run(targetUserId, currentUserId);
  });

  tx();

  return {
    userId: target.userId,
    username: target.username,
    displayName: target.displayName,
    avatar: target.avatar,
    status: 'accepted',
    online: false, // 由 ws-handler 层填充
    lastSeenAt: null,
  };
}

// ─── 好友列表 ───

export interface FriendListResult {
  friends: FriendInfo[];
  requests: FriendRequestInfo[];
}

export function listFriends(currentUserId: string, onlineUsers: Set<string>): FriendListResult {
  const db = getDb();

  const friends: FriendInfo[] = [];
  const requests: FriendRequestInfo[] = [];

  const rows = db.prepare(`
    SELECT f.user_id, f.friend_id, f.status, f.created_at,
           u.username, u.display_name, u.avatar, u.last_seen_at
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ?
    ORDER BY f.updated_at DESC
  `).all(currentUserId) as Array<{
    user_id: string; friend_id: string; status: string; created_at: number;
    username: string; display_name: string; avatar: string | null; last_seen_at: number | null;
  }>;

  for (const row of rows) {
    if (row.status === 'accepted') {
      friends.push({
        userId: row.friend_id,
        username: row.username,
        displayName: row.display_name,
        avatar: row.avatar,
        status: 'accepted',
        online: onlineUsers.has(row.friend_id),
        lastSeenAt: row.last_seen_at,
      });
    } else if (row.status === 'pending_received') {
      requests.push({
        userId: row.friend_id,
        username: row.username,
        displayName: row.display_name,
        avatar: row.avatar,
        status: 'pending_received',
        createdAt: row.created_at,
      });
    }
  }

  return { friends, requests };
}
