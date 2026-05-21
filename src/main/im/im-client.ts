import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { IM_DEFAULT_SERVER_URL, IM_RECONNECT_BACKOFF_MS, IM_HEARTBEAT_INTERVAL_MS, IM_HEARTBEAT_TIMEOUT_MS, IM_REQUEST_TIMEOUTS, IM_DEFAULT_REQUEST_TIMEOUT } from './im-config';
import { normalizeError, serverErrorToClient, networkError } from './im-errors';
import type { ImConnectionState, ImClientError, ImRegisterInput, ImLoginInput } from '../../shared/im-types';

// 简单日志封装
const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[IM] ${msg}`, meta || ''),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[IM] ${msg}`, meta || ''),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[IM] ${msg}`, meta || ''),
};

// ─── 类型 ───

interface PendingRequest {
  requestId: string;
  type: string;
  createdAt: number;
  timeout: NodeJS.Timeout;
  resolve: (payload: unknown) => void;
  reject: (error: ImClientError) => void;
  localMessageId?: string;
}

type EventHandler = (type: string, payload: unknown) => void;

// ─── IM Client 类 ───

export class ImClient {
  private ws: WebSocket | null = null;
  private serverUrl: string = IM_DEFAULT_SERVER_URL;
  private connectionState: ImConnectionState = 'idle';
  private pendingRequests = new Map<string, PendingRequest>();
  private eventHandlers = new Set<EventHandler>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private manualLogout = false;
  private currentToken: string | null = null;
  private currentUserId: string | null = null;

  // ─── 事件订阅 ───

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  private emit(type: string, payload: unknown): void {
    for (const handler of this.eventHandlers) {
      try { handler(type, payload); } catch { /* ignore handler errors */ }
    }
  }

  // ─── 状态 ───

  getState(): ImConnectionState { return this.connectionState; }
  getUserId(): string | null { return this.currentUserId; }
  getToken(): string | null { return this.currentToken; }

  private setState(state: ImConnectionState): void {
    this.connectionState = state;
    this.emit('connection-state', { state });
  }

  // ─── 连接 ───

  connect(serverUrl?: string): void {
    if (serverUrl) this.serverUrl = serverUrl;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.manualLogout = false;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  private doConnect(): void {
    this.setState('connecting');
    logger.info('Connecting', { url: this.serverUrl });

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch (err) {
      this.handleConnectionFailure(networkError('无法连接 IM 服务'));
      return;
    }

    this.ws.on('open', () => {
      logger.info('WebSocket opened');
      // 如果有 token，自动发送 auth.token
      if (this.currentToken) {
        this.setState('authenticating');
        this.sendRequest('auth.token', { token: this.currentToken })
          .then(() => { /* auth.ok handled by onAuthOk */ })
          .catch(() => { /* will be handled by response */ });
      }
      this.startHeartbeat();
    });

    this.ws.on('message', (data: Buffer) => {
      let msg: { type: string; requestId?: string; payload?: Record<string, unknown> };
      try { msg = JSON.parse(data.toString()); } catch { return; }

      const requestId = msg.requestId;

      // 处理心跳响应
      if (msg.type === 'pong') {
        this.resetHeartbeatTimeout();
      }

      // 处理请求响应
      if (requestId && this.pendingRequests.has(requestId)) {
        const pending = this.pendingRequests.get(requestId)!;
        this.pendingRequests.delete(requestId);
        clearTimeout(pending.timeout);

        if (msg.type === 'auth.error' || msg.type === 'sys.error') {
          const code = msg.payload?.code as string || 'UNKNOWN';
          const message = msg.payload?.message as string || '未知错误';
          // auth.error / TOKEN_INVALID 不 reject 所有请求，只 reject 当前
          pending.reject(serverErrorToClient(code, message));

          // token 失效时清空登录态
          if (msg.type === 'auth.error' && (code === 'TOKEN_INVALID')) {
            this.currentToken = null;
            this.currentUserId = null;
            this.emit('auth-state', { status: 'loggedOut', user: null });
          }
          return;
        }

        pending.resolve(msg.payload);
        return;
      }

      // 处理服务端推送事件
      this.handleServerPush(msg);
    });

    this.ws.on('close', (code: number) => {
      logger.info('WebSocket closed', { code });
      this.stopHeartbeat();
      this.cleanupPending();

      if (!this.manualLogout) {
        this.startReconnect();
      } else {
        this.setState('offline');
      }
    });

    this.ws.on('error', (err: Error) => {
      logger.error('WebSocket error', { error: err.message });
      // close 事件会随后触发，在 close 中处理重连
    });
  }

  private handleConnectionFailure(err: ImClientError): void {
    this.setState('error');
    this.emit('error', { error: err });
    if (!this.manualLogout) this.startReconnect();
  }

  disconnect(): void {
    this.manualLogout = true;
    this.stopReconnect();
    this.stopHeartbeat();
    this.cleanupPending();
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.currentToken = null;
    this.currentUserId = null;
    this.setState('idle');
  }

  // ─── 请求 ───

  async sendRequest(type: string, payload?: Record<string, unknown>, options?: { localMessageId?: string }): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw networkError('未连接到 IM 服务');
    }

    const requestId = randomUUID();
    const timeoutMs = IM_REQUEST_TIMEOUTS[type] || IM_DEFAULT_REQUEST_TIMEOUT;

    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject({ code: 'REQUEST_TIMEOUT', message: '请求超时', source: 'network' as const, retryable: true });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        requestId, type, createdAt: Date.now(), timeout, resolve, reject,
        localMessageId: options?.localMessageId,
      });
    });

    this.ws.send(JSON.stringify({ type, requestId, payload: payload || {} }));
    return promise;
  }

  // ─── 认证 ───

  async register(input: ImRegisterInput): Promise<unknown> {
    const result = await this.sendRequest('auth.register', {
      username: input.username,
      password: input.password,
      displayName: input.displayName,
    });
    this.onAuthOk(result as Record<string, unknown>);
    return result;
  }

  async login(input: ImLoginInput): Promise<unknown> {
    const result = await this.sendRequest('auth.login', {
      username: input.username,
      password: input.password,
    });
    this.onAuthOk(result as Record<string, unknown>);
    return result;
  }

  async loginWithToken(token: string): Promise<unknown> {
    this.currentToken = token;
    const result = await this.sendRequest('auth.token', { token });
    this.onAuthOk(result as Record<string, unknown>);
    return result;
  }

  private onAuthOk(payload: Record<string, unknown>): void {
    this.currentToken = payload.token as string;
    this.currentUserId = payload.userId as string;
    this.setState('online');
    this.reconnectAttempt = 0;
    this.emit('auth-state', {
      status: 'loggedIn' as const,
      user: {
        userId: payload.userId,
        username: payload.username,
        displayName: payload.displayName,
        avatar: payload.avatar || null,
      },
    });
  }

  getCurrentToken(): string | null { return this.currentToken; }

  // ─── 心跳 ───

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRequest('ping', {}).catch(() => {});
        this.heartbeatTimeoutTimer = setTimeout(() => {
          logger.warn('Heartbeat timeout');
          this.ws?.close(4002, 'Heartbeat timeout');
        }, IM_HEARTBEAT_TIMEOUT_MS);
      }
    }, IM_HEARTBEAT_INTERVAL_MS);
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.heartbeatTimeoutTimer) { clearTimeout(this.heartbeatTimeoutTimer); this.heartbeatTimeoutTimer = null; }
  }

  // ─── 重连 ───

  private startReconnect(): void {
    if (this.reconnectTimer) return;
    this.setState('reconnecting');

    const backoff = IM_RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, IM_RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempt++;

    logger.info('Reconnecting', { attempt: this.reconnectAttempt, delay: backoff });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, backoff);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnectAttempt = 0;
  }

  // ─── 清理 ───

  private cleanupPending(): void {
    const err = networkError('连接已断开');
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  // ─── 服务端推送 ───

  private handleServerPush(msg: { type: string; payload?: Record<string, unknown> }): void {
    this.emit(msg.type, msg.payload || {});

    // 处理下线相关的特殊推送
    if (msg.type === 'sys.error' && msg.payload?.code === 'REPLACED_BY_NEW_CONNECTION') {
      this.manualLogout = true;
      this.ws?.close(1000);
      this.emit('auth-state', { status: 'loggedOut', user: null });
    }
  }
}

// ─── 简单日志封装 ───
// (defined at top of file)
