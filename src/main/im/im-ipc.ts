import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { ImClient } from './im-client';
import * as imStore from './im-store';
import { normalizeError, badRequestError, cacheError } from './im-errors';
import type {
  ImAuthState, ImFriend, ImFriendRequest, ImMessage, ImConversation,
  ImSendMessageInput, ImSendMessageResult, ImClientError,
} from '../../shared/im-types';

let imClient: ImClient | null = null;
let mainWindow: BrowserWindow | null = null;
let handlersRegistered = false;

function getClient(): ImClient {
  if (!imClient) throw new Error('IM client not initialized');
  return imClient;
}

// ─── Renderer 事件发送 ───

function sendToRenderer(channel: string, data: unknown): void {
  try {
    mainWindow?.webContents.send(channel, data);
  } catch { /* window may be closed */ }
}

// ─── 加载本地缓存状态 ───

function loadLocalState(): { friends: ImFriend[]; requests: ImFriendRequest[]; conversations: ImConversation[] } | null {
  const user = imStore.getLocalUser();
  if (!user) return null;
  const friends = imStore.listCachedFriends(user.userId);
  const requests = imStore.listFriendRequests(user.userId);
  const conversations = imStore.listConversations(user.userId);
  return { friends, requests, conversations };
}

// ─── 事件监听绑定 ───

function bindClientEvents(client: ImClient): void {
  client.onEvent((type, payload) => {
    const p = payload as Record<string, unknown>;
    const userId = client.getUserId();

    switch (type) {
      // 连接状态
      case 'connection-state':
        sendToRenderer('im:connection-state', payload);
        break;

      // 认证状态
      case 'auth-state': {
        const authState = payload as unknown as ImAuthState;
        if (authState.status === 'loggedIn' && authState.user && userId) {
          try {
            // 保存 token 到本地
            const token = client.getCurrentToken();
            if (token) {
              const now = Math.floor(Date.now() / 1000);
              imStore.saveLocalUser({
                userId: authState.user.userId,
                username: authState.user.username,
                displayName: authState.user.displayName,
                avatar: authState.user.avatar,
                token,
                tokenExpiresAt: now + 30 * 24 * 3600, // 30 days
                serverUrl: '', // TODO: get actual server URL
              });
            }
          } catch (err) {
            sendToRenderer('im:error', { error: cacheError(String(err)) });
          }
        }
        sendToRenderer('im:auth-state', payload);
        break;
      }

      // ─── 好友 ───
      case 'friend.add_notify': {
        const fromUser = p.fromUser as Record<string, unknown>;
        const request: ImFriendRequest = {
          userId: fromUser.userId as string,
          username: fromUser.username as string,
          displayName: fromUser.displayName as string,
          avatar: fromUser.avatar as string | null,
          direction: 'in',
          status: 'pending',
          createdAt: Math.floor(Date.now() / 1000),
        };
        if (userId) {
          try { imStore.upsertFriendRequest(userId, request); } catch { /* cache error */ }
        }
        sendToRenderer('im:friend-request', { request });
        break;
      }

      case 'friend.accept_notify': {
        const fromUser = p.fromUser as Record<string, unknown>;
        if (userId) {
          try {
            imStore.upsertFriends(userId, [{
              userId: fromUser.userId as string,
              username: fromUser.username as string,
              displayName: fromUser.displayName as string,
              avatar: fromUser.avatar as string | null,
              status: 'accepted',
              online: false,
              lastSeenAt: null,
            }]);
          } catch { /* cache error */ }
        }
        sendToRenderer('im:friends-updated', loadLocalState() || { friends: [], requests: [] });
        break;
      }

      // ─── 消息 ───
      case 'msg.new': {
        const msg = p as Record<string, unknown>;
        const peerUserId = (msg.fromUser === userId ? msg.toUser : msg.fromUser) as string;
        if (userId) {
          try {
            const inserted = imStore.insertIncomingMessage(userId, {
              messageId: msg.messageId as string,
              fromUser: msg.fromUser as string,
              toUser: msg.toUser as string,
              content: msg.content as string,
              msgType: msg.msgType as string,
              createdAt: msg.createdAt as number,
            });
            if (inserted) {
              imStore.upsertConversation(userId, peerUserId, '', '', {
                lastMessagePreview: (msg.content as string).slice(0, 50),
                lastMessageAt: msg.createdAt as number,
                unreadDelta: 1,
              });
            }
          } catch { /* cache error */ }
        }
        sendToRenderer('im:message-new', {
          message: {
            messageId: msg.messageId,
            peerUserId,
            fromUser: msg.fromUser,
            toUser: msg.toUser,
            direction: msg.fromUser === userId ? 'out' : 'in',
            content: msg.content,
            msgType: msg.msgType,
            status: 'sent',
            createdAt: msg.createdAt,
            deliveredAt: null,
            readAt: null,
          },
        });
        break;
      }

      case 'sys.offline_msgs': {
        const messages = p.messages as Array<Record<string, unknown>>;
        if (userId && messages) {
          for (const msg of messages) {
            try {
              const peerUserId = (msg.fromUser === userId ? msg.toUser : msg.fromUser) as string;
              imStore.insertIncomingMessage(userId, {
                messageId: msg.messageId as string,
                fromUser: msg.fromUser as string,
                toUser: msg.toUser as string,
                content: msg.content as string,
                msgType: msg.msgType as string,
                createdAt: msg.createdAt as number,
              });
              imStore.upsertConversation(userId, peerUserId, '', '', {
                lastMessagePreview: (msg.content as string).slice(0, 50),
                lastMessageAt: msg.createdAt as number,
                unreadDelta: 1,
              });
            } catch { /* cache error */ }
          }
          sendToRenderer('im:friends-updated', loadLocalState() || { friends: [], requests: [] });
        }
        break;
      }

      // ─── 在线状态 ───
      case 'presence.online': {
        if (userId) {
          try {
            imStore.updateFriendOnline(userId, p.userId as string, true);
          } catch { /* cache error */ }
        }
        sendToRenderer('im:presence', { userId: p.userId, online: true });
        break;
      }

      case 'presence.offline': {
        if (userId) {
          try {
            imStore.updateFriendOnline(userId, p.userId as string, false, p.lastSeenAt as number);
          } catch { /* cache error */ }
        }
        sendToRenderer('im:presence', { userId: p.userId, online: false, lastSeenAt: p.lastSeenAt });
        break;
      }

      // 错误
      case 'error':
        sendToRenderer('im:error', payload);
        break;
    }
  });
}

// ─── IPC Handlers ───

export function setupImIpcHandlers(win: BrowserWindow | null = null): void {
  mainWindow = win || mainWindow;

  // 只注册一次 IPC handlers
  if (handlersRegistered) return;
  handlersRegistered = true;

  imClient = new ImClient();
  imStore.initImStore();
  bindClientEvents(imClient);

  // ── 连接 ──
  ipcMain.handle('im:connect', async (_event, serverUrl?: string) => {
    try {
      imClient = imClient || new ImClient();
      if (!imClient || imClient === null) {
        imClient = new ImClient();
        bindClientEvents(imClient);
      }
      imClient.connect(serverUrl);
      return { ok: true };
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:disconnect', async () => {
    getClient().disconnect();
    imStore.clearLocalUser();
    return { ok: true };
  });

  // ── 认证 ──
  ipcMain.handle('im:get-auth-state', async () => {
    const localUser = imStore.getLocalUser();
    if (!localUser) {
      return { status: 'loggedOut', user: null } as ImAuthState;
    }
    const client = getClient();
    if (client.getState() === 'online' && client.getUserId()) {
      return {
        status: 'loggedIn',
        user: { userId: client.getUserId()!, username: localUser.username, displayName: localUser.displayName, avatar: localUser.avatar },
      } as ImAuthState;
    }
    // 尝试 token 自动登录
    try {
      if (!imClient) {
        imClient = new ImClient();
        bindClientEvents(imClient);
      }
      imClient.connect(localUser.serverUrl || undefined);
      await imClient.loginWithToken(localUser.token);
      return { status: 'loggedIn', user: { userId: localUser.userId, username: localUser.username, displayName: localUser.displayName, avatar: localUser.avatar } } as ImAuthState;
    } catch {
      return { status: 'loggedOut', user: null } as ImAuthState;
    }
  });

  ipcMain.handle('im:register', async (_event, input: { username: string; password: string; displayName: string }) => {
    try {
      if (!input.username || !input.password || !input.displayName) throw badRequestError('缺少必填字段');
      const client = getClient();
      if (client.getState() !== 'online' && client.getState() !== 'connecting') {
        client.connect();
        await new Promise(r => setTimeout(r, 500));
      }
      const result = await client.register(input);
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:login', async (_event, input: { username: string; password: string }) => {
    try {
      if (!input.username || !input.password) throw badRequestError('缺少用户名或密码');
      const client = getClient();
      if (client.getState() !== 'online' && client.getState() !== 'connecting') {
        client.connect();
        await new Promise(r => setTimeout(r, 500));
      }
      const result = await client.login(input);
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:logout', async () => {
    getClient().disconnect();
    imStore.clearLocalUser();
    return { ok: true };
  });

  // ── 好友 ──
  ipcMain.handle('im:search-users', async (_event, query: string) => {
    try {
      if (!query || query.trim().length === 0) throw badRequestError('搜索内容不能为空');
      const result = await getClient().sendRequest('friend.search', { query: query.trim() });
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:list-friends', async () => {
    try {
      const client = getClient();
      if (client.getState() !== 'online') {
        // 离线时返回本地缓存
        const local = loadLocalState();
        return { friends: local?.friends || [], requests: local?.requests || [] };
      }
      const result = await client.sendRequest('friend.list', {});
      return result;
    } catch (err) {
      const local = loadLocalState();
      return { friends: local?.friends || [], requests: local?.requests || [], error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:add-friend', async (_event, userId: string) => {
    try {
      if (!userId) throw badRequestError('缺少 userId');
      const result = await getClient().sendRequest('friend.add', { userId });
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:accept-friend', async (_event, userId: string) => {
    try {
      if (!userId) throw badRequestError('缺少 userId');
      const result = await getClient().sendRequest('friend.accept', { userId });
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  // ── 消息 ──
  ipcMain.handle('im:send-message', async (_event, input: ImSendMessageInput) => {
    try {
      if (!input.toUser) throw badRequestError('缺少 toUser');
      if (!input.content || input.content.trim().length === 0) throw badRequestError('消息不能为空');
      if (input.content.length > 4000) throw badRequestError('消息过长');

      const client = getClient();
      const userId = client.getUserId();
      if (!userId) throw badRequestError('未登录');

      const localId = randomUUID();

      // 乐观写入本地
      try {
        imStore.insertPendingMessage(userId, localId, input.toUser, userId, input.toUser, input.content);
        imStore.upsertConversation(userId, input.toUser, '', '', {
          lastMessagePreview: input.content.slice(0, 50),
          lastMessageAt: Math.floor(Date.now() / 1000),
          unreadDelta: 0,
        });
      } catch { /* cache error */ }

      // 通知 Renderer pending 消息
      sendToRenderer('im:message-new', {
        message: {
          localId,
          messageId: '',
          peerUserId: input.toUser,
          fromUser: userId,
          toUser: input.toUser,
          direction: 'out',
          content: input.content,
          msgType: 'text',
          status: 'pending',
          createdAt: Math.floor(Date.now() / 1000),
          deliveredAt: null,
          readAt: null,
        },
      });

      // 发送
      try {
        const result = await client.sendRequest('msg.send', {
          toUser: input.toUser,
          content: input.content,
          msgType: 'text',
        }, { localMessageId: localId });

        const p = result as Record<string, unknown>;
        imStore.markMessageSent(userId, localId, p.messageId as string, p.createdAt as number);

        sendToRenderer('im:message-updated', {
          localId,
          message: {
            localId,
            messageId: p.messageId,
            peerUserId: input.toUser,
            fromUser: userId,
            toUser: input.toUser,
            direction: 'out',
            content: input.content,
            msgType: 'text',
            status: 'sent',
            createdAt: p.createdAt,
            deliveredAt: null,
            readAt: null,
          },
        });

        return { localId, messageId: p.messageId, status: 'sent' } as ImSendMessageResult;
      } catch (err) {
        imStore.markMessageFailed(userId, localId);
        const error = normalizeError(err);
        sendToRenderer('im:message-updated', {
          localId,
          message: {
            localId,
            messageId: '',
            peerUserId: input.toUser,
            fromUser: userId,
            toUser: input.toUser,
            direction: 'out',
            content: input.content,
            msgType: 'text',
            status: 'failed',
            createdAt: Math.floor(Date.now() / 1000),
            deliveredAt: null,
            readAt: null,
          },
        });
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
      const messages = imStore.listMessages(user.userId, peerUserId, options?.limit || 50, options?.before);
      return { messages };
    } catch (err) {
      return { messages: [], error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:load-history', async (_event, peerUserId: string, options?: { before?: number; limit?: number }) => {
    try {
      const result = await getClient().sendRequest('msg.history', {
        peerUser: peerUserId,
        before: options?.before,
        limit: options?.limit || 30,
      });
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:mark-read', async (_event, messageId: string) => {
    try {
      const result = await getClient().sendRequest('msg.read', { messageId });
      return result;
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  // ── 会话 ──
  ipcMain.handle('im:list-conversations', async () => {
    try {
      const user = imStore.getLocalUser();
      if (!user) return { conversations: [] };
      const conversations = imStore.listConversations(user.userId);
      return { conversations };
    } catch (err) {
      return { conversations: [], error: normalizeError(err) };
    }
  });

  ipcMain.handle('im:clear-unread', async (_event, peerUserId: string) => {
    try {
      const user = imStore.getLocalUser();
      if (user) imStore.clearUnread(user.userId, peerUserId);
      return { ok: true };
    } catch (err) {
      return { error: normalizeError(err) };
    }
  });

  // 启动时尝试自动连接
  const localUser = imStore.getLocalUser();
  if (localUser && imClient) {
    imClient.connect(localUser.serverUrl || undefined);
  }
}
