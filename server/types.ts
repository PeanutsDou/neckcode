import type { WebSocket } from 'ws';

// ─── WebSocket 消息信封 ───

export interface WsRequest {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

export interface WsResponse {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

// ─── 连接上下文 ───

export type PresenceStatus = 'online' | 'away' | 'busy';

export interface ClientContext {
  id: string;
  ws: WebSocket;
  userId: string | null;
  username: string | null;
  displayName: string | null;
  authenticated: boolean;
  connectedAt: number;
  lastMessageAt: number;
  rateWindowStart: number;
  rateWindowCount: number;
  status: PresenceStatus;
}

// ─── 用户 ───

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  avatar: string | null;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
}

export interface PublicUser {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

// ─── 好友 ───

export type FriendStatus = 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';

export interface FriendRow {
  user_id: string;
  friend_id: string;
  status: FriendStatus;
  created_at: number;
  updated_at: number;
}

export interface FriendInfo {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: FriendStatus;
  online: boolean;
  lastSeenAt: number | null;
}

export interface FriendRequestInfo {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: 'pending_received';
  createdAt: number;
}

export type SearchRelation = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';

export interface SearchUser {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  relation: SearchRelation;
}

// ─── 消息 ───

export type MsgType = 'text' | 'system';

export interface MessageAttachment {
  id?: string;
  type: 'image';
  data: string;
  mimeType: string;
  name?: string;
  size?: number;
}

export interface DirectMessageRow {
  id: string;
  from_user: string;
  to_user: string;
  content: string;
  msg_type: MsgType;
  created_at: number;
  delivered_at: number | null;
  read_at: number | null;
  attachments_json?: string | null;
}

export interface MessagePayload {
  messageId: string;
  fromUser: string;
  fromName: string;
  toUser: string;
  content: string;
  msgType: MsgType;
  createdAt: number;
  deliveredAt?: number | null;
  readAt?: number | null;
  attachments?: MessageAttachment[];
}

// ─── 认证 ───

export interface RegisterPayload {
  username: string;
  password: string;
  displayName: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface TokenPayload {
  token: string;
}

export interface JwtPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}
