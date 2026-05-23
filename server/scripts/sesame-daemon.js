// sesame 在线守护 — 保持连接，接收实时消息，写入 log
const { WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');

const SERVER = process.env.IM_HOST || 'ws://111.229.84.47/im';
const LOGFILE = path.join(__dirname, '..', 'sesame-inbox.log');
const USERNAME = 'sesame';
const PASSWORD = process.env.SESAME_PASS || 'xiaomei666';

let ws;
let reconnectTimer;
let pingTimer;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOGFILE, line + '\n');
}

function connect() {
  ws = new WebSocket(SERVER);
  
  ws.on('open', () => {
    log('CONNECTED');
    ws.send(JSON.stringify({ type: 'auth.login', requestId: 'auth', payload: { username: USERNAME, password: PASSWORD } }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'auth.ok') {
        log(`AUTH_OK — sesame 已上线 (${msg.payload.userId})`);
        startPing();
        return;
      }
      
      if (msg.type === 'msg.new') {
        const p = msg.payload;
        const fromName = p.fromName || p.fromUser;
        log(`📩 ${fromName}: ${p.content}`);
        return;
      }

      if (msg.type === 'friend.add_notify') {
        log(`👋 好友申请来自: ${msg.payload.fromUser?.displayName || msg.payload.fromUser?.username}`);
        // 自动接受
        ws.send(JSON.stringify({ type: 'friend.accept', requestId: 'auto_accept', payload: { userId: msg.payload.fromUser.userId } }));
        log('✅ 自动接受好友申请');
        return;
      }

      if (msg.type === 'sys.offline_msgs') {
        for (const m of (msg.payload.messages || [])) {
          log(`📩 [离线] ${m.fromName || m.fromUser}: ${m.content}`);
        }
        return;
      }

      if (msg.type === 'sys.error') {
        log(`⚠️ 错误: ${msg.payload.code} — ${msg.payload.message}`);
        return;
      }
    } catch {}
  });

  ws.on('close', () => {
    log('DISCONNECTED — 5秒后重连...');
    stopPing();
    reconnectTimer = setTimeout(connect, 5000);
  });

  ws.on('error', (e) => {
    log(`ERROR: ${e.message}`);
  });
}

function startPing() {
  pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', requestId: 'ping', payload: {} }));
    }
  }, 30000);
}

function stopPing() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
}

// 初始化和信号处理
log('Sesame 在线守护启动');
connect();

process.on('SIGINT', () => {
  log('SHUTDOWN');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stopPing();
  if (ws) ws.close();
  process.exit(0);
});
