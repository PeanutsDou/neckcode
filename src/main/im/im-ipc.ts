import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { ImClient } from './im-client';
import * as imStore from './im-store';
import { normalizeError, badRequestError, cacheError } from './im-errors';
import type {
  ImAuthState,
  ImFriend,
  ImFriendRequest,
  ImMessage,
  ImConversation,
  ImSendMessageInput,
  ImSendMessageResult,
} from '../../shared/im-types';

let imClient: ImClient | null = null;
let mainWindow: BrowserWindow | null = null;
let handlersRegistered = false;
let flushingPending = false;

function getClient(): ImClient {
  if (!imClient) throw new Error('IM client not initialized');
  return imClient;
}

function sendToRenderer(channel: string, data: unknown): void {
  try {
    mainWindow?.webContents.send(channel, data);
  } catch {
    /* window may be closed */
  }
}

function loadLocalState(): { friends: ImFriend[]; requests: ImFriendRequest[]; conversations: ImConversation[] } | null {
  const user = imStore.getLocalUser();
  if (!user) return null;
  return {
    friends: imStore.listCachedFriends(user.userId),
    requests: imStore.listFriendRequests(user.userId),
    conversations: imStore.listConversations(user.userId),
  };
}

function normalizeFriend(row: Record<string, unknown>): ImFriend {
  return {
    userId: String(row.userId || ''),
    username: String(row.username || ''),
    displayName: String(row.displayName || row.username || ''),
    avatar: (row.avatar as string | null) || null,
    status: 'accepted',
    online: Boolean(row.online),
    lastSeenAt: typeof row.lastSeenAt === 'number' ? row.lastSeenAt : null,
  };
}

function normalizeRequest(row: Record<string, unknown>, direction: 'in' | 'out' = 'in'): ImFriendRequest {
  return {
    userId: String(row.userId || ''),
    username: String(row.username || ''),
    displayName: String(row.displayName || row.username || ''),
    avatar: (row.avatar as string | null) || null,
    direction,
    status: 'pending',
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : Math.floor(Date.now() / 1000),
  };
}

function cacheFriendList(ownerUserId: string, result: Record<string, unknown>): { friends: ImFriend[]; requests: ImFriendRequest[] } {
  const friends = Array.isArray(result.friends)
    ? (result.friends as Array<Record<string, unknown>>).map(normalizeFriend).filter((f) => f.userId)
    : [];
  const requests = Array.isArray(result.requests)
    ? (result.requests as Array<Record<string, unknown>>).map((r) => normalizeRequest(r, 'in')).filter((r) => r.userId)
    : [];

  imStore.upsertFriends(ownerUserId, friends);
  imStore.replaceFriendRequests(ownerUserId, requests);
  return { friends: imStore.listCachedFriends(ownerUserId), requests: imStore.listFriendRequests(ownerUserId) };
}

function conversationFor(ownerUserId: string, peerUserId: string): ImConversation | null {
  return imStore.listConversations(ownerUserId).find((c) => c.peerUserId === peerUserId) || null;
}

function emitLocalState(): void {
  const state = loadLocalState();
  if (!state) return;
  sendToRenderer('im:friends-updated', { friends: state.friends, requests: state.requests });
  for (const conversation of state.conversations) {
    sendToRenderer('im:conversation-updated', { conversation });
  }
}

function messagePayloadToLocal(ownerUserId: string, msg: Record<string, unknown>): ImMessage {
  const fromUser = String(msg.fromUser || '');
  const toUser = String(msg.toUser || '');
  const peerUserId = fromUser === ownerUserId ? toUser : fromUser;
  return {
    localId: `svr:${String(msg.messageId || '')}`,
    messageId: String(msg.messageId || ''),
    peerUserId,
    fromUser,
    toUser,
    direction: fromUser === ownerUserId ? 'out' : 'in',
    content: String(msg.content || ''),
    msgType: String(msg.msgType || 'text'),
    status: 'sent',
    createdAt: Number(msg.createdAt || Math.floor(Date.now() / 1000)),
    deliveredAt: typeof msg.deliveredAt === 'number' ? msg.deliveredAt : null,
    readAt: typeof msg.readAt === 'number' ? msg.readAt : null,
  };
}

function cacheServerMessage(ownerUserId: string, msg: Record<string, unknown>, unreadDelta: number): ImMessage {
  const localMessage = messagePayloadToLocal(ownerUserId, msg);
  const inserted = imStore.insertIncomingMessage(ownerUserId, {
    messageId: localMessage.messageId,
    fromUser: localMessage.fromUser,
    toUser: localMessage.toUser,
    content: localMessage.content,
    msgType: localMessage.msgType,
    createdAt: localMessage.createdAt,
    deliveredAt: localMessage.deliveredAt,
    readAt: localMessage.readAt,
  });
  const friend = imStore.getFriend(ownerUserId, localMessage.peerUserId);
  imStore.upsertConversation(ownerUserId, localMessage.peerUserId, friend?.username || '', friend?.displayName || '', {
    lastMessagePreview: localMessage.content.slice(0, 50),
    lastMessageAt: localMessage.createdAt,
    unreadDelta: inserted ? unreadDelta : 0,
  });
  return localMessage;
}

async function sendPendingMessage(client: ImClient, ownerUserId: string, message: ImMessage): Promise<void> {
  if (!message.localId || client.getState() !== 'online') return;
  const result = await client.sendRequest('msg.send', {
    toUser: message.toUser,
    content: message.content,
    msgType: 'text',
  }, { localMessageId: message.localId }) as Record<string, unknown>;

  imStore.markMessageSent(ownerUserId, message.localId, String(result.messageId || ''), Number(result.createdAt || message.createdAt));
  const updated = imStore.getMessageByLocalId(ownerUserId, message.localId);
  if (updated) {
    sendToRenderer('im:message-updated', { localId: message.localId, message: updated });
  }
  const conv = conversationFor(ownerUserId, message.peerUserId);
  if (conv) sendToRenderer('im:conversation-updated', { conversation: conv });
}

async function flushPendingMessages(client: ImClient, ownerUserId: string): Promise<void> {
  if (flushingPending || client.getState() !== 'online') return;
  flushingPending = true;
  try {
    const pending = imStore.listPendingMessages(ownerUserId);
    for (const message of pending) {
      try {
        await sendPendingMessage(client, ownerUserId, message);
      } catch (err) {
        const error = normalizeError(err);
        if (!error.retryable && message.localId) {
          imStore.markMessageFailed(ownerUserId, message.localId);
          const failed = imStore.getMessageByLocalId(ownerUserId, message.localId);
          if (failed) sendToRenderer('im:message-updated', { localId: message.localId, message: failed });
        }
        if (error.retryable) break;
      }
    }
  } finally {
    flushingPending = false;
  }
}

function bindClientEvents(client: ImClient): void {
  client.onEvent((type, payload) => {
    const p = payload as Record<string, unknown>;
    const userId = client.getUserId();

    switch (type) {
      case 'connection-state':
        sendToRenderer('im:connection-state', payload);
        break;

      case 'auth-state': {
        const authState = payload as unknown as ImAuthState;
        if (authState.status === 'loggedIn' && authState.user && userId) {
          try {
            const token = client.getCurrentToken();
            if (token) {
              const now = Math.floor(Date.now() / 1000);
              imStore.saveLocalUser({
                userId: authState.user.userId,
                username: authState.user.username,
                displayName: authState.user.displayName,
                avatar: authState.user.avatar,
                token,
                tokenExpiresAt: now + 30 * 24 * 3600,
                serverUrl: client.getServerUrl(),
              });
            }
          } catch (err) {
            sendToRenderer('im:error', { error: cacheError(String(err)) });
          }
          void flushPendingMessages(client, userId);
        }
        sendToRenderer('im:auth-state', payload);
        break;
      }

      case 'friend.add_notify': {
        const fromUser = p.fromUser as Record<string, unknown>;
        const request = normalizeRequest(fromUser, 'in');
        if (userId) {
          try { imStore.upsertFriendRequest(userId, request); } catch { /* cache error */ }
        }
        sendToRenderer('im:friend-request', { request });
        emitLocalState();
        break;
      }

      case 'friend.accept_notify': {
        const fromUser = p.fromUser as Record<string, unknown>;
        if (userId) {
          try {
            imStore.upsertFriends(userId, [normalizeFriend({ ...fromUser, status: 'accepted', online: false })]);
          } catch { /* cache error */ }
        }
        emitLocalState();
        break;
      }

      case 'friend.remove_notify': {
        const removedUserId = String(p.userId || '');
        if (userId && removedUserId) {
          try { imStore.removeFriend(userId, removedUserId); } catch { /* cache error */ }
        }
        emitLocalState();
        break;
      }

      case 'msg.new': {
        if (!userId) break;
        const msg = p as Record<string, unknown>;
        const localMessage = cacheServerMessage(userId, msg, 1);
        sendToRenderer('im:message-new', { message: localMessage });
        const conv = conversationFor(userId, localMessage.peerUserId);
        if (conv) sendToRenderer('im:conversation-updated', { conversation: conv });
        break;
      }

      case 'sys.offline_msgs': {
        if (!userId || !Array.isArray(p.messages)) break;
        for (const msg of p.messages as Array<Record<string, unknown>>) {
          const localMessage = cacheServerMessage(userId, msg, 1);
          sendToRenderer('im:message-new', { message: localMessage });
          const conv = conversationFor(userId, localMessage.peerUserId);
          if (conv) sendToRenderer('im:conversation-updated', { conversation: conv });
        }
        emitLocalState();
        break;
      }

      case 'presence.online':
      case 'presence.offline': {
        const online = type === 'presence.online';
        const peerUserId = String(p.userId || '');
        if (userId && peerUserId) {
          try { imStore.updateFriendOnline(userId, peerUserId, online, p.lastSeenAt as number | undefined); } catch { /* cache error */ }
        }
        sendToRenderer('im:presence', { userId: peerUserId, online, lastSeenAt: p.lastSeenAt });
        break;
      }

      case 'error':
        sendToRenderer('im:error', payload);
        break;
    }
  });
}

export function setupImIpcHandlers(win: BrowserWindow | null = null): void {
  mainWindow = win || mainWindow;
  if (handlersRegistered) return;
  handlersRegistered = true;

  imClient = new ImClient();
  imStore.initImStore();
  bindClientEvents(imClient);

  ipcMain.handle('im:connect', async (_event, serverUrl?: string) => {
    try {
      const client = getClient();
      await client.connectAndWait(serverUrl);
      return { ok: true };
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:disconnect', async () => {
    getClient().disconnect();
    imStore.clearLocalUser();
    sendToRenderer('im:auth-state', { status: 'loggedOut', user: null });
    return { ok: true };
  });

  ipcMain.handle('im:get-auth-state', async () => {
    const localUser = imStore.getLocalUser();
    if (!localUser) return { status: 'loggedOut', user: null } as ImAuthState;

    const client = getClient();
    if (client.getState() === 'online' && client.getUserId()) {
      return {
        status: 'loggedIn',
        user: { userId: client.getUserId()!, username: localUser.username, displayName: localUser.displayName, avatar: localUser.avatar },
      } as ImAuthState;
    }

    try {
      await client.connectAndWait(localUser.serverUrl || undefined);
      await client.loginWithToken(localUser.token);
      return {
        status: 'loggedIn',
        user: { userId: localUser.userId, username: localUser.username, displayName: localUser.displayName, avatar: localUser.avatar },
      } as ImAuthState;
    } catch (err) {
      sendToRenderer('im:error', { error: normalizeError(err) });
      return { status: 'loggedOut', user: null } as ImAuthState;
    }
  });

  ipcMain.handle('im:register', async (_event, input: { username: string; password: string; displayName: string }) => {
    try {
      if (!input.username || !input.password || !input.displayName) throw badRequestError('请填写用户名、密码和显示名称');
      const client = getClient();
      await client.connectAndWait();
      return await client.register(input);
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:login', async (_event, input: { username: string; password: string }) => {
    try {
      if (!input.username || !input.password) throw badRequestError('请填写用户名和密码');
      const client = getClient();
      await client.connectAndWait();
      return await client.login(input);
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:logout', async () => {
    getClient().disconnect();
    imStore.clearLocalUser();
    sendToRenderer('im:auth-state', { status: 'loggedOut', user: null });
    return { ok: true };
  });

  ipcMain.handle('im:search-users', async (_event, query: string) => {
    try {
      if (!query || query.trim().length === 0) throw badRequestError('搜索内容不能为空');
      return await getClient().sendRequest('friend.search', { query: query.trim() });
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:list-friends', async () => {
    try {
      const client = getClient();
      const localUser = imStore.getLocalUser();
      if (!localUser || client.getState() !== 'online') {
        const local = loadLocalState();
        return { friends: local?.friends || [], requests: local?.requests || [] };
      }
      const result = await client.sendRequest('friend.list', {}) as Record<string, unknown>;
      const cached = cacheFriendList(localUser.userId, result);
      return cached;
    } catch (err) {
      const local = loadLocalState();
      return { friends: local?.friends || [], requests: local?.requests || [], error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:add-friend', async (_event, userId: string) => {
    try {
      if (!userId) throw badRequestError('缺少 userId');
      const result = await getClient().sendRequest('friend.add', { userId }) as Record<string, unknown>;
      const localUser = imStore.getLocalUser();
      if (localUser && result.status === 'pending_sent') {
        imStore.upsertFriendRequest(localUser.userId, normalizeRequest(result, 'out'));
        emitLocalState();
      } else if (localUser && result.status === 'accepted') {
        imStore.upsertFriends(localUser.userId, [normalizeFriend(result)]);
        emitLocalState();
      }
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:accept-friend', async (_event, userId: string) => {
    try {
      if (!userId) throw badRequestError('缺少 userId');
      const result = await getClient().sendRequest('friend.accept', { userId }) as Record<string, unknown>;
      const localUser = imStore.getLocalUser();
      const friendPayload = result.friend as Record<string, unknown> | undefined;
      if (localUser && friendPayload) {
        imStore.upsertFriends(localUser.userId, [normalizeFriend(friendPayload)]);
        imStore.removeFriendRequest(localUser.userId, userId);
        emitLocalState();
      }
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:remove-friend', async (_event, userId: string) => {
    try {
      if (!userId) throw badRequestError('缺少 userId');
      const result = await getClient().sendRequest('friend.remove', { userId }) as Record<string, unknown>;
      const localUser = imStore.getLocalUser();
      if (localUser) {
        imStore.removeFriend(localUser.userId, userId);
        emitLocalState();
      }
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:send-message', async (_event, input: ImSendMessageInput) => {
    try {
      if (!input.toUser) throw badRequestError('缺少接收人');
      if (!input.content || input.content.trim().length === 0) throw badRequestError('消息不能为空');
      if (input.content.length > 4000) throw badRequestError('消息过长');

      const client = getClient();
      const localUser = imStore.getLocalUser();
      const userId = client.getUserId() || localUser?.userId;
      if (!userId) throw badRequestError('未登录');

      const localId = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const friend = imStore.getFriend(userId, input.toUser);

      try {
        imStore.insertPendingMessage(userId, localId, input.toUser, userId, input.toUser, input.content);
        imStore.upsertConversation(userId, input.toUser, friend?.username || '', friend?.displayName || '', {
          lastMessagePreview: input.content.slice(0, 50),
          lastMessageAt: now,
          unreadDelta: 0,
        });
      } catch { /* cache error */ }

      const pendingMessage: ImMessage = {
        localId,
        messageId: '',
        peerUserId: input.toUser,
        fromUser: userId,
        toUser: input.toUser,
        direction: 'out',
        content: input.content,
        msgType: 'text',
        status: 'pending',
        createdAt: now,
        deliveredAt: null,
        readAt: null,
      };
      sendToRenderer('im:message-new', { message: pendingMessage });
      const pendingConv = conversationFor(userId, input.toUser);
      if (pendingConv) sendToRenderer('im:conversation-updated', { conversation: pendingConv });

      if (client.getState() !== 'online') {
        return { localId, status: 'pending' } as ImSendMessageResult;
      }

      try {
        await sendPendingMessage(client, userId, pendingMessage);
        const sentMessage = imStore.getMessageByLocalId(userId, localId);
        const result = sentMessage ? { messageId: sentMessage.messageId, createdAt: sentMessage.createdAt } : {};

        return { localId, messageId: result.messageId, createdAt: result.createdAt, status: 'sent' } as ImSendMessageResult;
      } catch (err) {
        const error = normalizeError(err);
        if (error.retryable) {
          return { localId, status: 'pending', error } as ImSendMessageResult;
        }
        imStore.markMessageFailed(userId, localId);
        const failedMessage = imStore.getMessageByLocalId(userId, localId) || { ...pendingMessage, status: 'failed' as const };
        sendToRenderer('im:message-updated', { localId, message: failedMessage });
        return { localId, status: 'failed', error } as ImSendMessageResult;
      }
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:list-messages', async (_event, peerUserId: string, options?: { limit?: number; before?: number }) => {
    try {
      const user = imStore.getLocalUser();
      if (!user) return { messages: [] };
      return { messages: imStore.listMessages(user.userId, peerUserId, options?.limit || 50, options?.before) };
    } catch (err) {
      return { messages: [], error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:load-history', async (_event, peerUserId: string, options?: { before?: number; limit?: number }) => {
    try {
      const user = imStore.getLocalUser();
      if (!user) return { messages: [] };
      const result = await getClient().sendRequest('msg.history', {
        peerUser: peerUserId,
        before: options?.before,
        limit: options?.limit || 30,
      }) as Record<string, unknown>;
      const messages = Array.isArray(result.messages) ? result.messages as Array<Record<string, unknown>> : [];
      for (const msg of messages) cacheServerMessage(user.userId, msg, 0);
      return { messages: imStore.listMessages(user.userId, peerUserId, options?.limit || 50, options?.before) };
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:mark-read', async (_event, messageId: string) => {
    try {
      return await getClient().sendRequest('msg.read', { messageId });
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:list-conversations', async () => {
    try {
      const user = imStore.getLocalUser();
      if (!user) return { conversations: [] };
      return { conversations: imStore.listConversations(user.userId) };
    } catch (err) {
      return { conversations: [], error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:clear-unread', async (_event, peerUserId: string) => {
    try {
      const user = imStore.getLocalUser();
      if (user) {
        imStore.clearUnread(user.userId, peerUserId);
        const conv = conversationFor(user.userId, peerUserId);
        if (conv) sendToRenderer('im:conversation-updated', { conversation: conv });
      }
      return { ok: true };
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });
}
