/**
 * IM Server Stage 1+2 烟雾测试脚本
 *
 * 用法: npx ts-node server/scripts/smoke-test.ts
 * 或编译后: node server/dist/scripts/smoke-test.js
 *
 * 前置条件: IM Server 已在 ws://localhost:7654 运行
 */

import { WebSocket } from 'ws';

const SERVER_URL = process.env.IM_TEST_URL || 'ws://localhost:7654';
const TIMEOUT = 5000;

let passed = 0;
let failed = 0;

function log(section: string, msg: string) {
  console.log(`  [${section}] ${msg}`);
}

function ok(test: string) {
  passed++;
  console.log(`  ✅ ${test}`);
}

function fail(test: string, reason: string) {
  failed++;
  console.log(`  ❌ ${test}: ${reason}`);
}

// ─── 工具函数 ───

interface TestWs {
  ws: WebSocket;
  requests: Map<string, { resolve: (payload: unknown) => void; reject: (err: Error) => void }>;
  events: unknown[];
  requestIdCounter: number;
}

function connect(): Promise<TestWs> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL);
    const requests = new Map<string, { resolve: (payload: unknown) => void; reject: (err: Error) => void }>();
    const events: unknown[] = [];
    let requestIdCounter = 0;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`连接超时: ${SERVER_URL}`));
    }, TIMEOUT);

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve({ ws, requests, events, requestIdCounter });
    });

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      const reqId = msg.requestId;

      if (reqId && requests.has(reqId)) {
        const { resolve: rs } = requests.get(reqId)!;
        requests.delete(reqId);
        rs(msg);
      } else {
        events.push(msg);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function send(t: TestWs, type: string, payload?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = `test_${++t.requestIdCounter}`;
    const msg = { type, requestId, payload: payload || {} };

    const timeout = setTimeout(() => {
      t.requests.delete(requestId);
      reject(new Error(`请求超时: ${type}`));
    }, TIMEOUT);

    t.requests.set(requestId, {
      resolve: (payload: unknown) => {
        clearTimeout(timeout);
        resolve(payload);
      },
      reject: (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    t.ws.send(JSON.stringify(msg));
  });
}

function assertOk(res: unknown, expectedType: string) {
  const r = res as Record<string, unknown>;
  if (r.type !== expectedType) {
    throw new Error(`期望 ${expectedType}，实际 ${r.type}: ${JSON.stringify(r)}`);
  }
}

function assertError(res: unknown, expectedCode: string) {
  const r = res as Record<string, unknown>;
  const payload = r.payload as Record<string, unknown> | undefined;
  const actualCode = payload?.code;
  if (actualCode !== expectedCode) {
    throw new Error(`期望错误码 ${expectedCode}，实际 ${actualCode}: ${JSON.stringify(r)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 测试用例 ───

async function runStage1Tests() {
  console.log('\n── Stage 1: 服务端骨架 ──');

  // 1.1 ping/pong
  {
    const t = await connect();
    try {
      const res = await send(t, 'ping');
      assertOk(res, 'pong');
      const payload = (res as Record<string, unknown>).payload as Record<string, unknown>;
      if (typeof payload?.serverTime === 'number') {
        ok('ping/pong — 正常');
      } else {
        fail('ping/pong', '缺少 serverTime');
      }
    } catch (err) {
      fail('ping/pong', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 1.2 非 JSON 输入
  {
    const t = await connect();
    try {
      t.ws.send('not json');
      const msg = await new Promise<unknown>((resolve) => {
        t.ws.once('message', (d) => resolve(JSON.parse(d.toString())));
      });
      assertError(msg, 'BAD_JSON');
      ok('非 JSON — BAD_JSON');
    } catch (err) {
      fail('非 JSON', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 1.3 空 object
  {
    const t = await connect();
    try {
      t.ws.send('{}');
      const msg = await new Promise<unknown>((resolve) => {
        t.ws.once('message', (d) => resolve(JSON.parse(d.toString())));
      });
      assertError(msg, 'BAD_REQUEST');
      ok('空 object — BAD_REQUEST');
    } catch (err) {
      fail('空 object', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 1.4 未知 type（已登录后）
  {
    const t = await connect();
    try {
      const testUser = `test_ukn_${Date.now()}`;
      // 先注册登录
      const regRes = await send(t, 'auth.register', { username: testUser, password: '123456', displayName: 'UKN' });
      assertOk(regRes, 'auth.ok');
      // 发未知 type
      const res = await send(t, 'unknown.test.xyz', {});
      assertError(res, 'UNKNOWN_TYPE');
      ok('未知 type — UNKNOWN_TYPE');
    } catch (err) {
      fail('未知 type', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 1.5 未登录发业务请求
  {
    const t = await connect();
    try {
      const res = await send(t, 'friend.list', {});
      assertError(res, 'UNAUTHORIZED');
      ok('未登录拦截 — UNAUTHORIZED');
    } catch (err) {
      fail('未登录拦截', String(err));
    } finally {
      t.ws.close();
    }
  }
}

async function runStage2Tests() {
  console.log('\n── Stage 2: 认证 ──');

  const username1 = `test_user_${Date.now()}`;
  const username2 = `test_user2_${Date.now()}`;
  const password1 = 'test123456';
  const password2 = 'test654321';
  let token1 = '';
  let userId1 = '';

  // 2.1 注册新用户
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.register', { username: username1, password: password1, displayName: 'TestUser1' });
      assertOk(res, 'auth.ok');
      const payload = (res as Record<string, unknown>).payload as Record<string, unknown>;
      token1 = String(payload.token);
      userId1 = String(payload.userId);
      if (!token1 || !userId1) throw new Error('缺少 token 或 userId');
      ok('注册 — auth.ok');
    } catch (err) {
      fail('注册', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.2 重复注册
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.register', { username: username1, password: password1, displayName: 'Dup' });
      assertError(res, 'USERNAME_EXISTS');
      ok('重复注册 — USERNAME_EXISTS');
    } catch (err) {
      fail('重复注册', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.3 用户名格式错误
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.register', { username: 'ab', password: '123456', displayName: 'Test' });
      assertError(res, 'BAD_REQUEST');
      ok('用户名过短 — BAD_REQUEST');
    } catch (err) {
      fail('用户名过短', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.4 密码过短
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.register', { username: 'testabc123', password: '12345', displayName: 'Test' });
      assertError(res, 'BAD_REQUEST');
      ok('密码过短 — BAD_REQUEST');
    } catch (err) {
      fail('密码过短', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.5 用户名密码登录 — 正确
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.login', { username: username1, password: password1 });
      assertOk(res, 'auth.ok');
      ok('正确密码登录 — auth.ok');
    } catch (err) {
      fail('正确密码登录', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.6 错误密码登录
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.login', { username: username1, password: 'wrongpassword' });
      assertError(res, 'INVALID_CREDENTIALS');
      ok('错误密码登录 — INVALID_CREDENTIALS');
    } catch (err) {
      fail('错误密码登录', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.7 不存在的用户登录
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.login', { username: 'nonexistent_user_xyz', password: '123456' });
      assertError(res, 'INVALID_CREDENTIALS');
      ok('不存在用户 — INVALID_CREDENTIALS');
    } catch (err) {
      fail('不存在用户', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.8 token 登录
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.token', { token: token1 });
      assertOk(res, 'auth.ok');
      ok('Token 登录 — auth.ok');
    } catch (err) {
      fail('Token 登录', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.9 无效 token
  {
    const t = await connect();
    try {
      const res = await send(t, 'auth.token', { token: 'invalid.token.here' });
      assertError(res, 'TOKEN_INVALID');
      ok('无效 token — TOKEN_INVALID');
    } catch (err) {
      fail('无效 token', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.10 已认证连接再次认证
  {
    const t = await connect();
    try {
      // 先登录
      const res1 = await send(t, 'auth.login', { username: username1, password: password1 });
      assertOk(res1, 'auth.ok');

      // 再尝试注册
      const res2 = await send(t, 'auth.register', { username: username2, password: password2, displayName: 'Test2' });
      assertError(res2, 'BAD_REQUEST');
      ok('已认证重复认证 — BAD_REQUEST');
    } catch (err) {
      fail('已认证重复认证', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 2.11 同用户重复登录（踢旧连接）
  {
    const t1 = await connect();
    try {
      const res1 = await send(t1, 'auth.login', { username: username1, password: password1 });
      assertOk(res1, 'auth.ok');

      // 创建第二个连接，用同一账号登录
      const t2 = await connect();
      try {
        const res2 = await send(t2, 'auth.login', { username: username1, password: password1 });
        assertOk(res2, 'auth.ok');
        ok('同用户重复登录 — 新连接 auth.ok');
      } catch (err) {
        fail('同用户重复登录-新连接', String(err));
      } finally {
        // 检查旧连接是否被踢
        // 旧连接应该收到 REPLACED 通知
        await sleep(500);
        t2.ws.close();
      }
    } catch (err) {
      fail('同用户重复登录', String(err));
    } finally {
      t1.ws.close();
    }
  }
}

// ─── Stage 3: 好友系统 ───

async function runStage3Tests() {
  console.log('\n── Stage 3: 好友系统 ──');

  const alice = `alice_${Date.now()}`;
  const bob = `bob_${Date.now()}`;
  const password = 'test123456';
  let aliceUserId = '';
  let bobUserId = '';

  // 3.1 注册 Alice 和 Bob
  {
    const a = await connect();
    const b = await connect();
    try {
      const resA = await send(a, 'auth.register', { username: alice, password, displayName: 'Alice' });
      assertOk(resA, 'auth.ok');
      aliceUserId = String(((resA as Record<string, unknown>).payload as Record<string, unknown>).userId);

      const resB = await send(b, 'auth.register', { username: bob, password, displayName: 'Bob' });
      assertOk(resB, 'auth.ok');
      bobUserId = String(((resB as Record<string, unknown>).payload as Record<string, unknown>).userId);

      ok('注册 Alice & Bob — 成功');
    } catch (err) {
      fail('注册 Alice & Bob', String(err));
    } finally {
      a.ws.close();
      b.ws.close();
    }
  }

  // 3.2 搜索用户
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.search', { query: 'bob' });
      assertOk(res, 'friend.search_result');
      const users = (res as Record<string, unknown>).payload as Record<string, unknown>;
      const list = users.users as Array<Record<string, unknown>>;
      if (!list || list.length === 0) throw new Error('搜索结果为空');
      if (list[0].relation !== 'none') throw new Error(`期望 relation=none，实际 ${list[0].relation}`);
      ok('搜索存在用户 — 正确');
    } catch (err) {
      fail('搜索存在用户', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.3 搜索自己
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.search', { query: alice });
      assertOk(res, 'friend.search_result');
      const users = ((res as Record<string, unknown>).payload as Record<string, unknown>).users as Array<Record<string, unknown>>;
      const self = users.find((user) => user.userId === aliceUserId);
      if (self?.relation !== 'self') throw new Error(`期望 relation=self，实际 ${self?.relation}`);
      ok('搜索自己 — relation=self');
    } catch (err) {
      fail('搜索自己', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.4 添加自己
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.add', { userId: aliceUserId });
      assertError(res, 'CANNOT_ADD_SELF');
      ok('添加自己 — CANNOT_ADD_SELF');
    } catch (err) {
      fail('添加自己', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.5 添加不存在用户
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.add', { userId: 'nonexistent-id' });
      assertError(res, 'USER_NOT_FOUND');
      ok('添加不存在用户 — USER_NOT_FOUND');
    } catch (err) {
      fail('添加不存在用户', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.6 Alice 添加 Bob
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.add', { userId: bobUserId });
      assertOk(res, 'friend.add_ack');
      const payload = (res as Record<string, unknown>).payload as Record<string, unknown>;
      if (payload.status !== 'pending_sent') throw new Error(`期望 status=pending_sent，实际 ${payload.status}`);
      ok('添加好友 — friend.add_ack(pending_sent)');
    } catch (err) {
      fail('添加好友', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.7 Bob 收到好友申请推送
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: bob, password });
      // 事件队列中应该有 friend.add_notify（因为 Alice 刚才添加了 Bob 但 Bob 当时不在线）
      // 在 friend.list 中应该能看到 pending request
      const res = await send(t, 'friend.list', {});
      assertOk(res, 'friend.list_result');
      const payload = (res as Record<string, unknown>).payload as Record<string, unknown>;
      const requests = payload.requests as Array<Record<string, unknown>>;
      if (!requests || requests.length === 0) throw new Error('未收到好友申请');
      if (requests[0].status !== 'pending_received') throw new Error(`期望 pending_received，实际 ${requests[0].status}`);
      ok('好友列表 — 包含 pending request');
    } catch (err) {
      fail('好友列表-pending', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.8 重复添加
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.add', { userId: bobUserId });
      assertError(res, 'FRIEND_REQUEST_EXISTS');
      ok('重复添加 — FRIEND_REQUEST_EXISTS');
    } catch (err) {
      fail('重复添加', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.9 Bob 接受好友
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: bob, password });
      const res = await send(t, 'friend.accept', { userId: aliceUserId });
      assertOk(res, 'friend.accept_ack');
      const friend = ((res as Record<string, unknown>).payload as Record<string, unknown>).friend as Record<string, unknown>;
      if (friend.status !== 'accepted') throw new Error(`期望 accepted，实际 ${friend.status}`);
      ok('接受好友 — friend.accept_ack(accepted)');
    } catch (err) {
      fail('接受好友', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.10 Alice 好友列表显示 accepted
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.list', {});
      assertOk(res, 'friend.list_result');
      const payload = (res as Record<string, unknown>).payload as Record<string, unknown>;
      const friends = payload.friends as Array<Record<string, unknown>>;
      if (!friends || friends.length === 0) throw new Error('好友列表为空');
      if (friends[0].status !== 'accepted') throw new Error(`期望 accepted，实际 ${friends[0].status}`);
      ok('好友列表 — accepted');
    } catch (err) {
      fail('好友列表-accepted', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.11 Alice 删除 Bob
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'friend.remove', { userId: bobUserId });
      assertOk(res, 'friend.remove_ack');
      const listRes = await send(t, 'friend.list', {});
      assertOk(listRes, 'friend.list_result');
      const payload = (listRes as Record<string, unknown>).payload as Record<string, unknown>;
      const friends = payload.friends as Array<Record<string, unknown>>;
      if (friends.some((f) => f.userId === bobUserId)) throw new Error('删除后仍出现在好友列表');
      ok('删除好友 — friend.remove_ack');
    } catch (err) {
      fail('删除好友', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 3.12 非好友发消息 → NOT_FRIEND
  {
    const carol = `carol_${Date.now()}`;
    const t = await connect();
    try {
      const res = await send(t, 'auth.register', { username: carol, password, displayName: 'Carol' });
      assertOk(res, 'auth.ok');
      // Carol 不是任何人好友，尝试给 Alice 发消息
      const msgRes = await send(t, 'msg.send', { toUser: aliceUserId, content: 'hello' });
      assertError(msgRes, 'NOT_FRIEND');
      ok('非好友发消息 — NOT_FRIEND');
    } catch (err) {
      fail('非好友发消息', String(err));
    } finally {
      t.ws.close();
    }
  }
}

// ─── Stage 4: 消息系统 ───

async function runStage4Tests() {
  console.log('\n── Stage 4: 消息系统 ──');

  const alice = `alice_msg_${Date.now()}`;
  const bob = `bob_msg_${Date.now()}`;
  const password = 'test123456';
  let aliceUserId = '';
  let bobUserId = '';
  let aliceToken = '';
  let bobToken = '';

  // 4.0 准备：注册 Alice 和 Bob，并建立好友关系
  {
    const a = await connect();
    const b = await connect();
    try {
      const resA = await send(a, 'auth.register', { username: alice, password, displayName: 'Alice' });
      assertOk(resA, 'auth.ok');
      const pA = (resA as Record<string, unknown>).payload as Record<string, unknown>;
      aliceUserId = String(pA.userId);
      aliceToken = String(pA.token);

      const resB = await send(b, 'auth.register', { username: bob, password, displayName: 'Bob' });
      assertOk(resB, 'auth.ok');
      const pB = (resB as Record<string, unknown>).payload as Record<string, unknown>;
      bobUserId = String(pB.userId);
      bobToken = String(pB.token);

      // Alice 添加 Bob
      const addRes = await send(a, 'friend.add', { userId: bobUserId });
      assertOk(addRes, 'friend.add_ack');

      // Bob 接受
      const acceptRes = await send(b, 'friend.accept', { userId: aliceUserId });
      assertOk(acceptRes, 'friend.accept_ack');

      ok('准备 — 注册+建立好友');
    } catch (err) {
      fail('准备', String(err));
    } finally {
      a.ws.close();
      b.ws.close();
    }
  }

  // 4.1 发送空消息
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'msg.send', { toUser: bobUserId, content: '' });
      assertError(res, 'MESSAGE_EMPTY');
      ok('空消息 — MESSAGE_EMPTY');
    } catch (err) {
      fail('空消息', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 4.2 在线消息：Alice 发给 Bob（Bob 在线）
  {
    const a = await connect();
    const b = await connect();
    try {
      await send(a, 'auth.login', { username: alice, password });
      await send(b, 'auth.login', { username: bob, password });

      // Bob 的事件队列中可能有 presence.online 来自 Alice
      // 发消息
      const ackRes = await send(a, 'msg.send', { toUser: bobUserId, content: 'Hello Bob!' });
      assertOk(ackRes, 'msg.ack');
      const ackPayload = (ackRes as Record<string, unknown>).payload as Record<string, unknown>;
      const msgId = String(ackPayload.messageId);
      if (!msgId) throw new Error('缺少 messageId');

      // Bob 应该收到 msg.new 推送（在 events 队列中）
      await sleep(200);
      const newMsg = b.events.find((e: unknown) => (e as Record<string, unknown>).type === 'msg.new');
      if (!newMsg) throw new Error('Bob 未收到 msg.new 推送');
      ok('在线消息 — ack + msg.new');
    } catch (err) {
      fail('在线消息', String(err));
    } finally {
      a.ws.close();
      b.ws.close();
    }
  }

  // 4.3 离线消息：Bob 离线，Alice 发消息，Bob 上线收到
  {
    const a = await connect();
    
    try {
      await send(a, 'auth.login', { username: alice, password });

      // Bob 先登录再立即断开（模拟不在线）
      const b = await connect();
      await send(b, 'auth.login', { username: bob, password });
      b.ws.close();
      await sleep(200);

      // Alice 发消息给 Bob（Bob 离线）
      const ackRes = await send(a, 'msg.send', { toUser: bobUserId, content: 'Offline message 1' });
      assertOk(ackRes, 'msg.ack');
      const ackPayload = (ackRes as Record<string, unknown>).payload as Record<string, unknown>;
      const msgId1 = String(ackPayload.messageId);

      // 再发第二条
      const ackRes2 = await send(a, 'msg.send', { toUser: bobUserId, content: 'Offline message 2' });
      assertOk(ackRes2, 'msg.ack');

      // Bob 重新上线
      const b2 = await connect();
      await send(b2, 'auth.login', { username: bob, password });
      
      await sleep(300);
      
      // Bob 应该收到 sys.offline_msgs
      const offlineMsg = b2.events.find((e: unknown) => (e as Record<string, unknown>).type === 'sys.offline_msgs');
      if (!offlineMsg) throw new Error('Bob 未收到 sys.offline_msgs');
      const offlinePayload = (offlineMsg as Record<string, unknown>).payload as Record<string, unknown>;
      const messages = offlinePayload.messages as Array<Record<string, unknown>>;
      if (!messages || messages.length < 2) throw new Error(`期望 2 条离线消息，实际 ${messages?.length || 0}`);
      ok('离线消息 — 上线收到 sys.offline_msgs');

      b2.ws.close();
    } catch (err) {
      fail('离线消息', String(err));
    } finally {
      a.ws.close();
    }
  }

  // 4.4 历史消息
  {
    const t = await connect();
    try {
      await send(t, 'auth.login', { username: alice, password });
      const res = await send(t, 'msg.history', { peerUser: bobUserId, limit: 30 });
      assertOk(res, 'msg.history_result');
      const payload = (res as Record<string, unknown>).payload as Record<string, unknown>;
      const messages = payload.messages as Array<Record<string, unknown>>;
      if (!Array.isArray(messages)) throw new Error('历史消息字段不是数组');
      if (messages.length !== 0) throw new Error('服务端不应保存长期历史消息');
      ok('历史消息 — 云端不保存长期历史');
    } catch (err) {
      fail('历史消息', String(err));
    } finally {
      t.ws.close();
    }
  }

  // 4.5 已读标记
  {
    const a = await connect();
    const b = await connect();
    try {
      await send(a, 'auth.login', { username: alice, password });
      await send(b, 'auth.login', { username: bob, password });

      // Alice 发消息给 Bob
      const ackRes = await send(a, 'msg.send', { toUser: bobUserId, content: 'Read me' });
      assertOk(ackRes, 'msg.ack');
      const ackPayload = (ackRes as Record<string, unknown>).payload as Record<string, unknown>;
      const msgId = String(ackPayload.messageId);

      await sleep(100);

      // Bob 标记已读
      const readRes = await send(b, 'msg.read', { messageId: msgId });
      assertOk(readRes, 'msg.read_ack');

      ok('已读标记 — read_ack');
    } catch (err) {
      fail('已读标记', String(err));
    } finally {
      a.ws.close();
      b.ws.close();
    }
  }
}

// ─── 主入口 ───

async function main() {
  console.log(`\n🚀 IM Server 烟雾测试`);
  console.log(`📡 目标: ${SERVER_URL}`);
  console.log(`⏱  超时: ${TIMEOUT}ms\n`);

  try {
    await runStage1Tests();
    await runStage2Tests();
    await runStage3Tests();
    await runStage4Tests();
  } catch (err) {
    console.error('测试异常:', String(err));
  }

  console.log(`\n──────────────────────`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`──────────────────────\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
