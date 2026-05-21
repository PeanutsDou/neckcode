// IM 共享类型 — 主进程和 Renderer 共用

// ─── 连接状态 ───

export type ImConnectionState = 'idle' | 'connecting' | 'authenticating' | 'online' | 'reconnecting' | 'offline' | 'error';

// ─── 用户 ───

export interface ImUser {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

// ─── 认证 ───

export interface ImAuthState {
  status: 'loggedOut' | 'loggedIn';
  user: ImUser | null;
}

export interface ImRegisterInput {
  username: string;
  password: string;
  displayName: string;
}

export interface ImLoginInput {
  username: string;
  password: string;
}

// ─── 好友 ───

export type FriendRelation = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';

export interface ImSearchUser {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  relation: FriendRelation;
}

export interface ImFriend {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: 'accepted';
  online: boolean;
  lastSeenAt: number | null;
}

export interface ImFriendRequest {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  direction: 'in' | 'out';
  status: 'pending' | 'accepted';
  createdAt: number;
}

// ─── 消息 ───

export type ImMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type ImMessageDirection = 'in' | 'out';

export interface ImMessage {
  localId?: string;
  messageId: string;
  peerUserId: string;
  fromUser: string;
  toUser: string;
  direction: ImMessageDirection;
  content: string;
  msgType: string;
  status: ImMessageStatus;
  createdAt: number;
  deliveredAt: number | null;
  readAt: number | null;
}

export interface ImSendMessageInput {
  toUser: string;
  content: string;
}

export interface ImSendMessageResult {
  localId: string;
  messageId?: string;
  createdAt?: number;
  status: 'pending' | 'sent' | 'failed';
  error?: ImClientError;
}

// ─── 会话 ───

export interface ImConversation {
  peerUserId: string;
  peerUsername: string;
  peerDisplayName: string;
  lastMessagePreview: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
}

// ─── 错误 ───

export interface ImClientError {
  code: string;
  message: string;
  source: 'server' | 'client' | 'network' | 'cache';
  retryable: boolean;
}

// ─── IPC 事件类型 ───

export interface ImEventMap {
  'im:auth-state': { state: ImAuthState };
  'im:connection-state': { state: ImConnectionState };
  'im:friends-updated': { friends: ImFriend[]; requests: ImFriendRequest[] };
  'im:friend-request': { request: ImFriendRequest };
  'im:message-new': { message: ImMessage };
  'im:message-updated': { localId: string; message: ImMessage };
  'im:conversation-updated': { conversation: ImConversation };
  'im:presence': { userId: string; online: boolean; lastSeenAt?: number };
  'im:error': { error: ImClientError };
}
