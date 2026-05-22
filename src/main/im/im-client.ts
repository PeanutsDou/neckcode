import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import {
  IM_DEFAULT_SERVER_URL,
  IM_RECONNECT_BACKOFF_MS,
  IM_HEARTBEAT_INTERVAL_MS,
  IM_HEARTBEAT_TIMEOUT_MS,
  IM_REQUEST_TIMEOUTS,
  IM_DEFAULT_REQUEST_TIMEOUT,
} from './im-config';
import { serverErrorToClient, networkError } from './im-errors';
import type { ImConnectionState, ImClientError, ImRegisterInput, ImLoginInput } from '../../shared/im-types';

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[IM] ${msg}`, meta || ''),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[IM] ${msg}`, meta || ''),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[IM] ${msg}`, meta || ''),
};

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

export class ImClient {
  private ws: WebSocket | null = null;
  private serverUrl = IM_DEFAULT_SERVER_URL;
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
  private openWaiters: Array<{ resolve: () => void; reject: (error: ImClientError) => void; timeout: NodeJS.Timeout }> = [];

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  private emit(type: string, payload: unknown): void {
    for (const handler of this.eventHandlers) {
      try { handler(type, payload); } catch { /* ignore renderer listener errors */ }
    }
  }

  getState(): ImConnectionState { return this.connectionState; }
  getUserId(): string | null { return this.currentUserId; }
  getToken(): string | null { return this.currentToken; }
  getCurrentToken(): string | null { return this.currentToken; }
  getServerUrl(): string { return this.serverUrl; }

  private setState(state: ImConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.emit('connection-state', { state });
  }

  connect(serverUrl?: string): void {
    if (serverUrl) this.serverUrl = serverUrl;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.manualLogout = false;
    this.stopReconnect();
    this.doConnect();
  }

  async connectAndWait(serverUrl?: string, timeoutMs = 10000): Promise<void> {
    if (serverUrl) this.serverUrl = serverUrl;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const promise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.openWaiters = this.openWaiters.filter((w) => w.resolve !== resolve);
        reject(networkError('连接 IM 服务超时'));
      }, timeoutMs);
      this.openWaiters.push({ resolve, reject, timeout });
    });

    this.connect();
    return promise;
  }

  private resolveOpenWaiters(): void {
    const waiters = this.openWaiters;
    this.openWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
  }

  private rejectOpenWaiters(error: ImClientError): void {
    const waiters = this.openWaiters;
    this.openWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  private doConnect(): void {
    this.setState('connecting');
    logger.info('Connecting', { url: this.serverUrl });

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch {
      this.handleConnectionFailure(networkError('无法连接 IM 服务'));
      return;
    }

    const socket = this.ws;

    socket.on('open', () => {
      logger.info('WebSocket opened');
      this.resolveOpenWaiters();
      this.startHeartbeat();

      if (this.currentToken) {
        this.setState('authenticating');
        this.sendRequest('auth.token', { token: this.currentToken })
          .then((payload) => this.onAuthOk(payload as Record<string, unknown>))
          .catch((err) => this.emit('error', { error: err }));
      } else {
        this.setState('idle');
      }
    });

    socket.on('message', (data: Buffer) => {
      let msg: { type: string; requestId?: string; payload?: Record<string, unknown> };
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'pong') {
        this.resetHeartbeatTimeout();
      }

      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        this.pendingRequests.delete(msg.requestId);
        clearTimeout(pending.timeout);

        if (msg.type === 'auth.error' || msg.type === 'sys.error') {
          const code = String(msg.payload?.code || 'UNKNOWN');
          const message = String(msg.payload?.message || '未知错误');
          const error = serverErrorToClient(code, message);
          pending.reject(error);

          if (msg.type === 'auth.error' && code === 'TOKEN_INVALID') {
            this.currentToken = null;
            this.currentUserId = null;
            this.emit('auth-state', { status: 'loggedOut', user: null });
          }
          return;
        }

        pending.resolve(msg.payload || {});
        return;
      }

      this.handleServerPush(msg);
    });

    socket.on('close', (code: number) => {
      logger.info('WebSocket closed', { code });
      if (this.ws === socket) this.ws = null;
      this.stopHeartbeat();
      this.cleanupPending();
      this.rejectOpenWaiters(networkError('IM 连接已关闭'));

      if (!this.manualLogout) {
        this.startReconnect();
      } else {
        this.setState('idle');
      }
    });

    socket.on('error', (err: Error) => {
      logger.error('WebSocket error', { error: err.message });
      this.rejectOpenWaiters(networkError(err.message || 'IM 连接错误'));
    });
  }

  private handleConnectionFailure(err: ImClientError): void {
    this.setState('error');
    this.rejectOpenWaiters(err);
    this.emit('error', { error: err });
    if (!this.manualLogout) this.startReconnect();
  }

  disconnect(options?: { keepToken?: boolean }): void {
    this.manualLogout = true;
    this.stopReconnect();
    this.stopHeartbeat();
    this.cleanupPending();
    this.rejectOpenWaiters(networkError('IM 连接已断开'));
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    if (!options?.keepToken) {
      this.currentToken = null;
      this.currentUserId = null;
    }
    this.setState('idle');
  }

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
        requestId,
        type,
        createdAt: Date.now(),
        timeout,
        resolve,
        reject,
        localMessageId: options?.localMessageId,
      });
    });

    try {
      this.ws.send(JSON.stringify({ type, requestId, payload: payload || {} }));
    } catch {
      const pending = this.pendingRequests.get(requestId);
      if (pending) clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      throw networkError('发送 IM 请求失败');
    }

    return promise;
  }

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
    if (this.ws?.readyState !== WebSocket.OPEN) {
      await this.connectAndWait();
    }
    this.currentToken = token;
    this.setState('authenticating');
    const result = await this.sendRequest('auth.token', { token });
    this.onAuthOk(result as Record<string, unknown>);
    return result;
  }

  private onAuthOk(payload: Record<string, unknown>): void {
    this.currentToken = String(payload.token || this.currentToken || '');
    this.currentUserId = String(payload.userId || '');
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

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.resetHeartbeatTimeout();
      this.sendRequest('ping', {}).catch(() => {});
      this.heartbeatTimeoutTimer = setTimeout(() => {
        logger.warn('Heartbeat timeout');
        this.ws?.close(4002, 'Heartbeat timeout');
      }, IM_HEARTBEAT_TIMEOUT_MS);
    }, IM_HEARTBEAT_INTERVAL_MS);
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.resetHeartbeatTimeout();
  }

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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
  }

  private cleanupPending(): void {
    const err = networkError('连接已断开');
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  private handleServerPush(msg: { type: string; payload?: Record<string, unknown> }): void {
    this.emit(msg.type, msg.payload || {});

    if (msg.type === 'sys.error' && msg.payload?.code === 'REPLACED_BY_NEW_CONNECTION') {
      this.manualLogout = true;
      this.currentToken = null;
      this.currentUserId = null;
      this.ws?.close(1000);
      this.emit('auth-state', { status: 'loggedOut', user: null });
    }
  }
}
