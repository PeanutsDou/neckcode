import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { config } from './config';
import { logger } from './logger';
import { AppError, ErrorCodes } from './errors';
import type { WsRequest, WsResponse, ClientContext, PresenceStatus } from './types';
import * as auth from './auth';
import * as friends from './friends';
import * as messages from './messages';
import { getDb } from './db';

// ─── 在线用户表 ───

const onlineUsers = new Map<string, ClientContext>();

function getOnlineUserIds(): Set<string> {
  return new Set(onlineUsers.keys());
}

// ─── 上下文管理 ───

function createContext(ws: WebSocket): ClientContext {
  return {
    id: randomUUID(),
    ws,
    userId: null,
    username: null,
    displayName: null,
    authenticated: false,
    connectedAt: Date.now(),
    lastMessageAt: Date.now(),
    rateWindowStart: Date.now(),
    rateWindowCount: 0,
    status: 'online' as PresenceStatus,
  };
}

// ─── 发送封装 ───

function send(ctx: ClientContext, res: WsResponse): boolean {
  if (ctx.ws.readyState !== WebSocket.OPEN) return false;
  try {
    ctx.ws.send(JSON.stringify(res));
    return true;
  } catch (err) {
    logger.error('Failed to send message', { error: String(err) });
    return false;
  }
}

function sendError(ctx: ClientContext, requestId: string | undefined, error: AppError): void {
  send(ctx, {
    type: 'sys.error',
    requestId,
    payload: {
      code: error.code,
      message: error.publicMessage,
      details: error.details || {},
    },
  });
}

function sendAuthError(ctx: ClientContext, requestId: string | undefined, error: AppError): void {
  send(ctx, {
    type: 'auth.error',
    requestId,
    payload: {
      code: error.code,
      message: error.publicMessage,
    },
  });
}

export function pushToUser(userId: string, res: WsResponse): boolean {
  const ctx = onlineUsers.get(userId);
  if (!ctx || ctx.ws.readyState !== WebSocket.OPEN) {
    // 用户不在线或连接已关闭
    if (ctx && ctx.ws.readyState !== WebSocket.OPEN) {
      handleOffline(ctx);
    }
    return false;
  }
  return send(ctx, res);
}

// ─── 下线处理 ───

function handleOffline(ctx: ClientContext): void {
  if (!ctx.authenticated || !ctx.userId) return;

  // 只有当前连接还在 onlineUsers 中才清理
  const existing = onlineUsers.get(ctx.userId);
  if (existing !== ctx) return;

  onlineUsers.delete(ctx.userId);

  // 更新 last_seen_at
  try {
    const db = getDb();
    db.prepare('UPDATE users SET last_seen_at = unixepoch() WHERE id = ?').run(ctx.userId);
  } catch (err) {
    logger.error('Failed to update last_seen_at', { userId: ctx.userId, error: String(err) });
  }

  logger.info('User offline', { userId: ctx.userId, username: ctx.username });

  // 广播下线给好友
  broadcastToFriends(ctx.userId, {
    type: 'presence.offline',
    payload: { userId: ctx.userId, lastSeenAt: Math.floor(Date.now() / 1000) },
  });
}

// ─── 上线广播 ───

function broadcastOnline(userId: string): void {
  broadcastToFriends(userId, {
    type: 'presence.online',
    payload: { userId, status: 'online' },
  });
}

function broadcastToFriends(userId: string, message: WsResponse): void {
  const db = getDb();
  const friendRows = db.prepare(
    "SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'"
  ).all(userId) as Array<{ friend_id: string }>;

  for (const row of friendRows) {
    pushToUser(row.friend_id, message);
  }
}

// ─── 离线消息推送 ───

function pushOfflineMessages(userId: string): void {
  const offlineMsgs = messages.getOfflineMessages(userId);
  if (offlineMsgs.length === 0) return;

  const ctx = onlineUsers.get(userId);
  if (!ctx) return;

  send(ctx, {
    type: 'sys.offline_msgs',
    payload: { messages: offlineMsgs },
  });

  // 标记为已送达
  messages.markDelivered(offlineMsgs.map((m) => m.messageId));

  logger.info('Pushed offline messages', { userId, count: offlineMsgs.length });
}

// ─── 限流 ───

function checkRateLimit(ctx: ClientContext): void {
  const now = Date.now();
  if (now - ctx.rateWindowStart > 1000) {
    ctx.rateWindowStart = now;
    ctx.rateWindowCount = 0;
  }
  ctx.rateWindowCount++;
  if (ctx.rateWindowCount > config.rateLimitPerSec) {
    throw new AppError(ErrorCodes.RATE_LIMITED, '请求过于频繁');
  }
}

// ─── JSON 解析 ───

function parseMessage(data: Buffer): WsRequest {
  let raw: unknown;
  try {
    raw = JSON.parse(data.toString());
  } catch {
    throw new AppError(ErrorCodes.BAD_JSON, '消息格式错误，无法解析 JSON');
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '消息必须是 JSON 对象');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.type !== 'string' || obj.type.trim() === '') {
    throw new AppError(ErrorCodes.BAD_REQUEST, '缺少 type 字段');
  }

  const payload = obj.payload;
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    throw new AppError(ErrorCodes.BAD_REQUEST, 'payload 必须是 JSON 对象');
  }

  return {
    type: obj.type.trim(),
    requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
    payload: (payload as Record<string, unknown>) ?? {},
  };
}

// ─── 鉴权检查 ───

const AUTH_WHITELIST = new Set(['auth.register', 'auth.login', 'auth.token', 'ping']);

function requireAuth(ctx: ClientContext, type: string): void {
  if (!ctx.authenticated && !AUTH_WHITELIST.has(type)) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, '请先登录');
  }
}

// ─── 消息分发 ───

async function dispatch(ctx: ClientContext, req: WsRequest): Promise<void> {
  switch (req.type) {
    case 'ping':
      send(ctx, {
        type: 'pong',
        requestId: req.requestId,
        payload: { serverTime: Math.floor(Date.now() / 1000) },
      });
      return;

    // ─── 认证 ───
    case 'auth.register': {
      if (ctx.authenticated) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '已登录，不能重复认证'));
        return;
      }
      const p = req.payload || {};
      const username = String(p.username || '').trim();
      const password = String(p.password || '');
      const displayName = String(p.displayName || '').trim();

      // 输入校验
      validateUsername(username);
      validatePassword(password);
      validateDisplayName(displayName);

      const result = auth.register({ username, password, displayName });
      bindAuth(ctx, result.userId, result.username, result.displayName);

      send(ctx, {
        type: 'auth.ok',
        requestId: req.requestId,
        payload: {
          userId: result.userId,
          username: result.username,
          displayName: result.displayName,
          avatar: null,
          token: result.token,
          expiresAt: result.expiresAt,
        },
      });
      return;
    }

    case 'auth.login': {
      if (ctx.authenticated) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '已登录，不能重复认证'));
        return;
      }
      const p = req.payload || {};
      const username = String(p.username || '').trim();
      const password = String(p.password || '');

      if (!username || !password) {
        sendAuthError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '用户名和密码不能为空'));
        return;
      }

      const result = auth.login({ username, password });
      bindAuth(ctx, result.userId, result.username, result.displayName);

      send(ctx, {
        type: 'auth.ok',
        requestId: req.requestId,
        payload: {
          userId: result.userId,
          username: result.username,
          displayName: result.displayName,
          avatar: null,
          token: result.token,
          expiresAt: result.expiresAt,
        },
      });
      return;
    }

    case 'auth.token': {
      if (ctx.authenticated) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '已登录，不能重复认证'));
        return;
      }
      const p = req.payload || {};
      const token = String(p.token || '').trim();

      if (!token) {
        sendAuthError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, 'token 不能为空'));
        return;
      }

      const result = auth.loginWithToken(token);
      bindAuth(ctx, result.userId, result.username, result.displayName);

      send(ctx, {
        type: 'auth.ok',
        requestId: req.requestId,
        payload: {
          userId: result.userId,
          username: result.username,
          displayName: result.displayName,
          avatar: null,
          token: result.token,
          expiresAt: result.expiresAt,
        },
      });
      return;
    }

    // ─── 好友 ───
    case 'friend.search': {
      const p = req.payload || {};
      const query = String(p.query || '').trim();
      const results = friends.searchUsers(ctx.userId!, query);
      send(ctx, {
        type: 'friend.search_result',
        requestId: req.requestId,
        payload: { users: results },
      });
      return;
    }

    case 'friend.add': {
      const p = req.payload || {};
      const targetUserId = String(p.userId || '').trim();
      if (!targetUserId) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '缺少 userId'));
        return;
      }

      const result = friends.addFriend(ctx.userId!, targetUserId);

      send(ctx, {
        type: 'friend.add_ack',
        requestId: req.requestId,
        payload: {
          userId: result.userId,
          username: result.username,
          displayName: result.displayName,
          avatar: result.avatar,
          status: result.status,
        },
      });

      // 如果目标在线，推送好友申请通知
      if (result.status === 'pending_sent') {
        pushToUser(targetUserId, {
          type: 'friend.add_notify',
          payload: {
            fromUser: {
              userId: ctx.userId,
              username: ctx.username,
              displayName: ctx.displayName,
              avatar: null,
            },
          },
        });
      }
      return;
    }

    case 'friend.accept': {
      const p = req.payload || {};
      const targetUserId = String(p.userId || '').trim();
      if (!targetUserId) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '缺少 userId'));
        return;
      }

      const result = friends.acceptFriend(ctx.userId!, targetUserId);

      send(ctx, {
        type: 'friend.accept_ack',
        requestId: req.requestId,
        payload: {
          friend: {
            ...result.friend,
            online: getOnlineUserIds().has(result.friend.userId),
          },
        },
      });

      // 如果申请方在线，推送接受通知
      pushToUser(targetUserId, {
        type: 'friend.accept_notify',
        payload: {
          fromUser: {
            userId: ctx.userId,
            username: ctx.username,
            displayName: ctx.displayName,
            avatar: null,
          },
        },
      });
      return;
    }

    case 'friend.remove': {
      const p = req.payload || {};
      const targetUserId = String(p.userId || '').trim();
      if (!targetUserId) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '缺少 userId'));
        return;
      }

      const result = friends.removeFriend(ctx.userId!, targetUserId);
      send(ctx, {
        type: 'friend.remove_ack',
        requestId: req.requestId,
        payload: { userId: result.userId },
      });

      pushToUser(targetUserId, {
        type: 'friend.remove_notify',
        payload: { userId: ctx.userId },
      });
      return;
    }

    case 'friend.list': {
      const result = friends.listFriends(ctx.userId!, getOnlineUserIds());
      send(ctx, {
        type: 'friend.list_result',
        requestId: req.requestId,
        payload: {
          friends: result.friends,
          requests: result.requests,
        },
      });
      return;
    }

    // ─── 消息 ───
    case 'msg.send': {
      const p = req.payload || {};
      const toUser = String(p.toUser || '').trim();
      const content = String(p.content || '');
      const msgType = String(p.msgType || 'text');

      if (!toUser) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '缺少 toUser'));
        return;
      }

      const result = messages.sendMessage(ctx.userId!, ctx.username!, toUser, content, msgType);

      // 发送回执
      send(ctx, {
        type: 'msg.ack',
        requestId: req.requestId,
        payload: {
          messageId: result.messageId,
          toUser: result.toUser,
          createdAt: result.createdAt,
        },
      });

      const messagePayload = {
        messageId: result.messageId,
        fromUser: ctx.userId,
        fromName: ctx.displayName,
        toUser: result.toUser,
        content: result.content,
        msgType: result.msgType,
        createdAt: result.createdAt,
      };

      // 在线消息直接转发；离线时只保存未送达队列，送达后删除，不保存长期历史。
      if (pushToUser(toUser, {
        type: 'msg.new',
        payload: messagePayload,
      })) {
        logger.info('Message pushed online', { messageId: result.messageId, toUser });
      } else {
        messages.queueOfflineMessage({
          messageId: result.messageId,
          fromUser: ctx.userId!,
          toUser: result.toUser,
          content: result.content,
          msgType: result.msgType,
          createdAt: result.createdAt,
        });
      }
      return;
    }

    case 'msg.history': {
      const p = req.payload || {};
      const peerUser = String(p.peerUser || '').trim();
      const before = typeof p.before === 'number' ? p.before : undefined;
      const limit = typeof p.limit === 'number' ? p.limit : 30;

      if (!peerUser) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '缺少 peerUser'));
        return;
      }

      const history = messages.getHistory(ctx.userId!, peerUser, before, limit);
      send(ctx, {
        type: 'msg.history_result',
        requestId: req.requestId,
        payload: {
          peerUser,
          messages: history,
        },
      });
      return;
    }

    case 'msg.read': {
      const p = req.payload || {};
      const messageId = String(p.messageId || '').trim();

      if (!messageId) {
        sendError(ctx, req.requestId, new AppError(ErrorCodes.BAD_REQUEST, '缺少 messageId'));
        return;
      }

      const result = messages.markRead(ctx.userId!, messageId);
      send(ctx, {
        type: 'msg.read_ack',
        requestId: req.requestId,
        payload: {
          messageId: result.messageId,
          readAt: result.readAt,
        },
      });

      return;
    }

    default:
      // 未知类型（Stage 1 只需这个；后续 Stage 会继续加 case）
      send(ctx, {
        type: 'sys.error',
        requestId: req.requestId,
        payload: {
          code: ErrorCodes.UNKNOWN_TYPE,
          message: `未知消息类型: ${req.type}`,
        },
      });
  }
}

// ─── 绑定认证上下文 ───

function bindAuth(ctx: ClientContext, userId: string, username: string, displayName: string): void {
  // 如果之前已经认证过同一个连接（理论上不会），先清理
  // 踢掉同一用户旧连接
  const old = onlineUsers.get(userId);
  if (old && old !== ctx) {
    logger.info('Replacing old connection', { userId, oldCtxId: old.id, newCtxId: ctx.id });
    send(old, {
      type: 'sys.error',
      payload: {
        code: 'REPLACED_BY_NEW_CONNECTION',
        message: '您的账号在其他地方登录',
      },
    });
    old.ws.close(4001, 'Replaced by new connection');
    onlineUsers.delete(userId);
  }

  ctx.userId = userId;
  ctx.username = username;
  ctx.displayName = displayName;
  ctx.authenticated = true;
  onlineUsers.set(userId, ctx);

  // 广播上线给好友
  broadcastOnline(userId);

  // 推送离线消息
  pushOfflineMessages(userId);
}

// ─── 输入校验 ───

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

function validateUsername(username: string): void {
  if (username.length < 3 || username.length > 32) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '用户名需 3-32 个字符');
  }
  if (!USERNAME_RE.test(username)) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '用户名只能包含字母、数字、下划线和短横线');
  }
}

function validatePassword(password: string): void {
  if (password.length < 6 || password.length > 128) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '密码需 6-128 个字符');
  }
}

function validateDisplayName(name: string): void {
  if (name.length < 1 || name.length > 32) {
    throw new AppError(ErrorCodes.BAD_REQUEST, '显示名称需 1-32 个字符');
  }
}

// ─── 心跳清理 ───

let heartbeatTimer: NodeJS.Timeout | null = null;

function startHeartbeatCheck(): void {
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, ctx] of onlineUsers) {
      if (now - ctx.lastMessageAt > config.heartbeatTimeoutMs) {
        logger.warn('Heartbeat timeout, closing connection', { userId, username: ctx.username });
        ctx.ws.close(4002, 'Heartbeat timeout');
        // handleOffline 会在 close 事件中调用
      }
    }
  }, 30000);
}

function stopHeartbeatCheck(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ─── 启动服务 ───

export function startServer(): WebSocketServer {
  const wss = new WebSocketServer({ host: config.host, port: config.port });

  wss.on('connection', (ws: WebSocket) => {
    const ctx = createContext(ws);

    logger.info('New connection', { ctxId: ctx.id });

    ws.on('message', (data: Buffer) => {
      ctx.lastMessageAt = Date.now();

      // 限流检查
      try {
        checkRateLimit(ctx);
      } catch (err) {
        if (err instanceof AppError) {
          send(ctx, { type: 'sys.error', payload: { code: err.code, message: err.publicMessage } });
        }
        return;
      }

      // 解析 JSON
      let req: WsRequest;
      try {
        req = parseMessage(data);
      } catch (err) {
        if (err instanceof AppError) {
          send(ctx, { type: 'sys.error', payload: { code: err.code, message: err.publicMessage } });
        }
        return;
      }

      // 鉴权检查
      try {
        requireAuth(ctx, req.type);
      } catch (err) {
        if (err instanceof AppError) {
          send(ctx, { type: 'sys.error', requestId: req.requestId, payload: { code: err.code, message: err.publicMessage } });
        }
        return;
      }

      // 分发处理
      dispatch(ctx, req).catch((err) => {
        if (err instanceof AppError) {
          if (req.type.startsWith('auth.')) {
            sendAuthError(ctx, req.requestId, err);
          } else {
            sendError(ctx, req.requestId, err);
          }
        } else {
          logger.error('Unhandled error in dispatch', { error: String(err), type: req.type });
          send(ctx, {
            type: 'sys.error',
            requestId: req.requestId,
            payload: { code: ErrorCodes.INTERNAL_ERROR, message: '服务端内部错误' },
          });
        }
      });
    });

    ws.on('close', () => {
      logger.info('Connection closed', { ctxId: ctx.id, userId: ctx.userId });
      handleOffline(ctx);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error', { ctxId: ctx.id, error: String(err) });
      handleOffline(ctx);
    });
  });

  wss.on('listening', () => {
    logger.info(`IM Server listening on ws://${config.host}:${config.port}`);
    startHeartbeatCheck();
  });

  wss.on('error', (err) => {
    logger.error('Server error', { error: String(err) });
    process.exit(1);
  });

  return wss;
}

export function stopServer(wss: WebSocketServer): void {
  stopHeartbeatCheck();

  // 通知所有在线连接
  for (const [userId, ctx] of onlineUsers) {
    send(ctx, {
      type: 'sys.error',
      payload: { code: 'SERVER_SHUTDOWN', message: '服务器正在关闭' },
    });
    ctx.ws.close(1001, 'Server shutting down');
  }
  onlineUsers.clear();

  wss.close();
  logger.info('IM Server stopped');
}
