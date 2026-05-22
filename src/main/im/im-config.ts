// IM 客户端默认配置

export const IM_DEFAULT_SERVER_URL = 'ws://111.229.84.47/im';

export const IM_RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

export const IM_HEARTBEAT_INTERVAL_MS = 30000;
export const IM_HEARTBEAT_TIMEOUT_MS = 5000;

export const IM_REQUEST_TIMEOUTS: Record<string, number> = {
  'auth.register': 10000,
  'auth.login': 10000,
  'auth.token': 10000,
  'friend.search': 10000,
  'friend.add': 10000,
  'friend.accept': 10000,
  'friend.list': 10000,
  'friend.remove': 10000,
  'msg.send': 15000,
  'msg.history': 15000,
  'msg.read': 10000,
  ping: 5000,
};

export const IM_DEFAULT_REQUEST_TIMEOUT = 10000;
