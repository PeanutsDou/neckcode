// sesame 发送消息工具
const { WebSocket } = require('ws');
const SERVER = process.env.IM_HOST || 'ws://111.229.84.47/im';

async function sendMsg(toUsername, content) {
  const ws = new WebSocket(SERVER);
  await new Promise(r => ws.on('open', r));
  
  const _send = (t, p) => new Promise(r => {
    const rid = 's_' + Math.random().toString(36).slice(2);
    const h = (d) => { const m = JSON.parse(d.toString()); if (m.requestId === rid) { ws.removeListener('message', h); r(m); } };
    ws.on('message', h);
    ws.send(JSON.stringify({ type: t, requestId: rid, payload: p || {} }));
  });

  await _send('auth.login', { username: 'sesame', password: process.env.SESAME_PASS || 'xiaomei666' });
  const s = await _send('friend.search', { query: toUsername });
  const target = s.payload.users?.find(u => u.username === toUsername);
  if (!target) { console.log('user not found'); ws.close(); return; }

  const m = await _send('msg.send', { toUser: target.userId, content });
  console.log(m.type === 'msg.ack' ? `sent to @${toUsername}: ${content.slice(0, 40)}...` : 'send failed: ' + (m.payload?.code || m.type));
  ws.close();
}

const [,, toUser, ...msgParts] = process.argv;
if (!toUser || msgParts.length === 0) {
  console.log('Usage: node sesame-send.js <username> <message>');
  process.exit(1);
}
sendMsg(toUser, msgParts.join(' ')).catch(e => console.error(e.message));
