# IM Phase 1 服务端设计

> 状态：草案，待审阅  
> 依赖协议：[02-protocol.md](./02-protocol.md)  
> 范围：独立 IM Server，一对一文字 IM，不接入 Agent

## 1. 目标

IM Server 是独立 Node.js 服务，负责账号、好友、在线状态、一对一消息中转和消息持久化。

服务端必须做到：

- 认证可靠：注册、登录、token 登录流程明确。
- 状态可恢复：用户离线后重新上线能收到未送达消息。
- 权限收束：服务端只信任连接上下文，不信任客户端传入的身份。
- 错误可控：所有可预期失败都有明确错误码，不让异常直接穿透到 WebSocket。
- 模块边界清晰：WebSocket 层只路由，业务逻辑放到 service 模块。
- Phase 1 足够简单：不实现群组、文件、图片、Agent、端到端加密、分布式部署。

## 2. 非目标

Phase 1 不做：

- 群聊 / 房间
- 多端同时在线同步
- 文件、图片、语音、视频
- 消息撤回、编辑、引用、转发
- 端到端加密
- 服务端 LLM / Agent 推理
- 多实例横向扩展
- Redis、PostgreSQL、对象存储
- 管理后台

这些能力后续可以基于当前协议和数据模型扩展，但不进入第一版实现。

## 3. 技术选型

建议使用：

| 能力 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js 18+ | 与项目 Electron/TypeScript 技术栈一致 |
| 语言 | TypeScript | 与现有项目一致，便于共享类型 |
| WebSocket | `ws` | 轻量、稳定、足够覆盖 Phase 1 |
| 数据库 | `better-sqlite3` | 项目已有依赖，单文件部署简单 |
| 密码哈希 | Node `crypto.scryptSync` 或 `bcrypt` | 优先减少原生依赖可用 `scrypt` |
| Token | `jsonwebtoken` 或自实现 HMAC JWT | 推荐 `jsonwebtoken`，但要固定错误处理 |
| ID | `crypto.randomUUID()` | Node 内置，无需新增 uuid 依赖 |

推荐依赖：

```text
ws
jsonwebtoken
@types/ws
@types/jsonwebtoken
```

如果选择 `crypto.scryptSync`，可以不新增 `bcrypt`。

## 4. 目录结构

服务端建议放在项目根目录 `server/` 下，独立于 Electron 主进程。

```text
server/
  index.ts          # 启动入口，读取配置，初始化 DB，启动 WS server
  config.ts         # 端口、数据库路径、JWT secret、限制参数
  db.ts             # SQLite 初始化、schema、迁移、事务工具
  types.ts          # 协议类型、连接上下文、领域类型
  errors.ts         # AppError、错误码、错误响应构造
  auth.ts           # 注册、登录、token 签发和校验
  friends.ts        # 搜索、申请、接受、删除、列表
  messages.ts       # 发送、离线、已读、历史
  presence.ts       # 在线连接 Map、上下线广播、状态广播
  ws-handler.ts     # JSON 解析、鉴权、限流、按 type 分发
  logger.ts         # 统一日志，Phase 1 可先 console 封装
```

测试脚本可放：

```text
server/
  scripts/
    smoke-client.ts
    seed-users.ts
```

## 5. 配置

`config.ts` 统一输出服务端配置。

建议配置项：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `IM_HOST` | `0.0.0.0` | 监听地址 |
| `IM_PORT` | `7654` | WebSocket 端口 |
| `IM_DB_PATH` | `./data/im-server.db` | 服务端 SQLite 路径 |
| `IM_JWT_SECRET` | 开发环境随机生成 | 生产环境必须固定 |
| `IM_TOKEN_EXPIRES_IN` | `30d` | token 有效期 |
| `IM_MAX_MESSAGE_LENGTH` | `4000` | 单条文本消息最大长度 |
| `IM_MAX_QUERY_LENGTH` | `64` | 用户搜索最大长度 |
| `IM_RATE_LIMIT_PER_SEC` | `20` | 单连接每秒消息数 |
| `IM_HEARTBEAT_TIMEOUT_MS` | `90000` | 心跳超时 |
| `IM_HISTORY_LIMIT_MAX` | `100` | 历史消息最大拉取条数 |

要求：

- 生产环境如果没有 `IM_JWT_SECRET`，服务端启动时必须打印高优先级警告。
- 开发环境可以生成临时 secret，但重启后旧 token 会失效。
- 数据库目录不存在时自动创建。
- 配置读取失败应在启动阶段直接失败，不要让服务端半启动。

## 6. 数据库设计

服务端数据库独立于客户端本地缓存。Phase 1 使用 SQLite 单文件。

### 6.1 users

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

说明：

- `id` 使用 `crypto.randomUUID()`。
- `username` 登录名唯一，不可修改。
- `password_hash` 不保存明文密码。
- `last_seen_at` 在用户下线时更新。

### 6.2 friends

推荐 Phase 1 使用双向两行记录。

```sql
CREATE TABLE IF NOT EXISTS friends (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (user_id <> friend_id),
  CHECK (status IN ('pending_sent', 'pending_received', 'accepted', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_user_status ON friends(user_id, status);
```

好友申请：

```text
A 添加 B
A -> B: pending_sent
B -> A: pending_received
```

接受好友：

```text
A -> B: accepted
B -> A: accepted
```

删除好友：

```text
删除 A -> B 和 B -> A 两行
```

所有成对写入必须放在事务里。

### 6.3 direct_messages

```sql
CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  content TEXT NOT NULL,
  msg_type TEXT NOT NULL DEFAULT 'text',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  delivered_at INTEGER,
  read_at INTEGER,
  FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (from_user <> to_user),
  CHECK (msg_type IN ('text', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_dm_from_to_created ON direct_messages(from_user, to_user, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_to_from_created ON direct_messages(to_user, from_user, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_to_delivered ON direct_messages(to_user, delivered_at);
```

说明：

- Phase 1 只允许客户端发送 `text`。
- `system` 预留给服务端系统消息，不进入第一版 UI 也可以。
- 离线消息通过 `to_user = ? AND delivered_at IS NULL` 查询。

## 7. 连接上下文

每条 WebSocket 连接需要一个服务端上下文。

```ts
interface ClientContext {
  id: string;
  ws: WebSocket;
  userId: string | null;
  username: string | null;
  displayName: string | null;
  authenticated: boolean;
  connectedAt: number;
  lastMessageAt: number;
  lastPongAt: number;
  rateWindowStartedAt: number;
  rateWindowCount: number;
  status: 'online' | 'away' | 'busy';
}
```

服务端还需要在线表：

```ts
onlineUsers: Map<string, ClientContext>
```

Phase 1 建议限制单用户单连接：

- 同一用户新连接认证成功时，如果旧连接还在线，关闭旧连接。
- 关闭旧连接时使用明确原因，例如 `REPLACED_BY_NEW_CONNECTION`。

这样能避免多端在线导致的 delivered/read 状态歧义。多端同步留到后续设计。

## 8. WebSocket 消息处理总流程

`ws-handler.ts` 负责统一入口。

```text
收到原始 message
  ├─ 更新时间 lastMessageAt
  ├─ 限流检查
  ├─ 解析 JSON
  ├─ 校验 envelope
  ├─ 如果 type 是 ping，直接 pong
  ├─ 如果未认证，只允许 auth.register/auth.login/auth.token
  ├─ 按 type 分发到 service
  ├─ service 返回响应或触发推送
  └─ 捕获错误，返回 auth.error 或 sys.error
```

Envelope 校验：

- 消息必须是 JSON object。
- `type` 必须是非空字符串。
- 客户端请求建议带 `requestId`。
- `payload` 为空时视为 `{}`。
- `payload` 如果存在，必须是 object。

未知 `type`：

```json
{
  "type": "sys.error",
  "requestId": "<原 requestId>",
  "payload": {
    "code": "UNKNOWN_TYPE",
    "message": "未知消息类型"
  }
}
```

## 9. 认证设计

### 9.1 注册

`auth.register` 流程：

```text
校验 username/password/displayName
  ├─ username 格式错误 -> BAD_REQUEST
  ├─ password 长度错误 -> BAD_REQUEST
  ├─ displayName 长度错误 -> BAD_REQUEST
查询 username 是否存在
  ├─ 已存在 -> USERNAME_EXISTS
生成 userId
哈希密码
写入 users
签发 token
绑定连接上下文
写入 onlineUsers
返回 auth.ok
推送离线消息
广播 presence.online
```

注意：

- 注册成功即登录。
- 如果当前连接已经认证，再发 `auth.register` 应返回 `BAD_REQUEST` 或关闭旧状态后重新认证。建议返回 `BAD_REQUEST`，不允许已登录连接重复认证。

### 9.2 登录

`auth.login` 流程：

```text
校验 username/password 非空
查询用户
  ├─ 不存在 -> INVALID_CREDENTIALS
校验密码 hash
  ├─ 失败 -> INVALID_CREDENTIALS
签发 token
绑定连接上下文
处理同用户旧连接
写入 onlineUsers
返回 auth.ok
推送离线消息
广播 presence.online
```

错误策略：

- 用户不存在和密码错误统一返回 `INVALID_CREDENTIALS`，避免枚举用户。
- 登录失败可以按连接/IP/用户名做计数，Phase 1 至少在日志中记录。

### 9.3 Token 登录

`auth.token` 流程：

```text
校验 token 非空
verify token
  ├─ 过期或签名错误 -> TOKEN_INVALID
查询 token 中 userId 是否存在
  ├─ 不存在 -> TOKEN_INVALID
绑定连接上下文
处理同用户旧连接
写入 onlineUsers
返回 auth.ok
推送离线消息
广播 presence.online
```

JWT payload 建议：

```json
{
  "userId": "u_123",
  "username": "alice"
}
```

不要把密码 hash、displayName、权限之外的扩展信息放入 token。

## 10. 好友服务设计

所有好友接口都需要认证。

### 10.1 搜索用户

`friend.search` 流程：

```text
校验 query
  ├─ 空或过长 -> BAD_REQUEST
按 username/displayName/id 搜索 users
排除敏感字段
为每个结果计算 relation
返回 friend.search_result
```

建议：

- 最多返回 20 条。
- 精确 username 命中优先。
- 可以允许搜索自己的账号，但 relation 返回 `self`。

### 10.2 添加好友

`friend.add` 流程：

```text
校验 userId
  ├─ userId 是自己 -> CANNOT_ADD_SELF
查询目标用户
  ├─ 不存在 -> USER_NOT_FOUND
查询当前关系
  ├─ accepted -> FRIEND_ALREADY_EXISTS
  ├─ pending_sent -> FRIEND_REQUEST_EXISTS
  ├─ pending_received -> 可直接转为 accepted，或要求走 friend.accept
事务写入两行 pending
返回 friend.add_ack
如果目标在线，推送 friend.add_notify
```

收束决策：

- 如果 A 已收到 B 的申请，此时 A 再 `friend.add(B)`，建议直接等价于 `friend.accept(B)`，把双方关系改为 `accepted`。
- 这样用户体验更自然，也减少重复申请状态。

### 10.3 接受好友

`friend.accept` 流程：

```text
校验 userId
查询对方用户
  ├─ 不存在 -> USER_NOT_FOUND
查询关系
  ├─ 当前用户没有 pending_received -> FRIEND_REQUEST_NOT_FOUND
事务更新两行 accepted
返回 friend.accept_ack
如果对方在线，推送 friend.accept_notify
```

必须检查：

- 只有收到申请的一方可以 accept。
- 不允许 accept 自己。

### 10.4 删除好友

`friend.remove` 流程：

```text
校验 userId
事务删除两行关系
返回 friend.remove_ack
```

即使关系不存在，也可以返回成功，保持幂等。

Phase 1 不向被删除方推送通知。被删除方下次 `friend.list` 或发送消息时以服务端为准。

### 10.5 好友列表

`friend.list` 返回两组数据：

- `friends`: accepted 好友
- `requests`: pending_received 好友申请

流程：

```text
查询当前用户 friends
JOIN users
补充 online 和 lastSeenAt
返回 friend.list_result
```

在线状态以 `onlineUsers.has(friendId)` 为准。

## 11. 消息服务设计

所有消息接口都需要认证。

### 11.1 发送消息

`msg.send` 流程：

```text
校验 toUser/content/msgType
  ├─ content 空 -> MESSAGE_EMPTY
  ├─ content 过长 -> MESSAGE_TOO_LONG
  ├─ msgType 非 text -> BAD_REQUEST
查询接收方
  ├─ 不存在 -> USER_NOT_FOUND
校验好友关系 accepted
  ├─ 不是好友 -> NOT_FRIEND
插入 direct_messages
返回 msg.ack
如果接收方在线：
  ├─ 推送 msg.new
  └─ 推送成功后更新 delivered_at
```

关键约束：

- `fromUser` 永远来自连接上下文。
- 客户端 payload 中不允许传 `fromUser`，即使传了也必须忽略。
- `msg.ack` 表示服务端已入库，不表示对方已收到。
- `delivered_at` Phase 1 表示服务端已向接收方 WebSocket 发出消息。

推送失败处理：

- 如果 `ws.send` 抛错或连接不再 OPEN，不更新 `delivered_at`。
- 从 `onlineUsers` 删除该用户连接。
- 触发该用户下线流程。
- 消息保留为未送达，等待下次上线离线推送。

### 11.2 离线消息

认证成功后调用 `pushOfflineMessages(userId)`。

流程：

```text
查询 to_user = userId AND delivered_at IS NULL
  ├─ 无消息 -> 不推送，或推送空数组均可；建议不推送
按 created_at ASC 排序
推送 sys.offline_msgs
推送成功后批量更新 delivered_at
```

Phase 1 风险：

- 服务端发出后就标记 delivered，客户端本地落库前断线可能丢展示。

收束决策：

- Phase 1 接受该风险，依靠 `msg.history` 做修复。
- 如果审阅后认为不可接受，则新增 `msg.delivered_ack`，但会增加协议和实现复杂度。

### 11.3 已读

`msg.read` 流程：

```text
校验 messageId
查询消息
  ├─ 不存在 -> BAD_REQUEST
校验当前用户是 to_user
  ├─ 否 -> UNAUTHORIZED
如果 read_at 为空，更新 read_at
返回 msg.read_ack
如果 from_user 在线，推送 msg.read_notify
```

幂等：

- 重复 `msg.read` 应返回成功。
- 如果已有 `read_at`，返回原 `read_at`。

### 11.4 历史消息

`msg.history` 流程：

```text
校验 peerUser
查询 peerUser 是否存在
校验双方是 accepted 好友
limit 归一化到 1-100
before 为空则从最新开始
查询双方之间 direct_messages
返回 msg.history_result
```

查询条件：

```sql
((from_user = currentUser AND to_user = peerUser)
 OR
 (from_user = peerUser AND to_user = currentUser))
```

返回排序：

- 数据库可以倒序查最新 N 条。
- 返回给客户端前按 `created_at ASC` 排列。

## 12. 在线状态服务设计

`presence.ts` 负责在线用户表和广播。

### 12.1 用户上线

认证成功后：

```text
如果 onlineUsers 已有该 userId：
  ├─ 关闭旧连接
  └─ 替换为新连接
onlineUsers.set(userId, ctx)
查询 accepted 好友
向在线好友推送 presence.online
```

注意：

- 替换旧连接时不要误广播 offline 再 online，避免 UI 闪烁。
- 可以给旧连接发 `sys.error`，code 为 `REPLACED_BY_NEW_CONNECTION`，然后 close。

### 12.2 用户下线

连接 close/error 时：

```text
如果 ctx 未认证 -> 直接结束
如果 onlineUsers.get(ctx.userId) 不是当前 ctx -> 说明已被新连接替换，不广播 offline
onlineUsers.delete(userId)
更新 users.last_seen_at
查询 accepted 好友
向在线好友推送 presence.offline
```

### 12.3 状态设置

`presence.status` Phase 1 可后置。

如果实现：

```text
校验 status in online/away/busy
更新 ctx.status
返回 presence.status_ack
向在线好友推送 presence.status_notify
```

## 13. 统一错误处理

服务端内部使用 `AppError`。

```ts
class AppError extends Error {
  code: string;
  publicMessage: string;
  status?: number;
  details?: Record<string, unknown>;
}
```

错误响应规则：

- `auth.register`、`auth.login`、`auth.token` 中的认证失败返回 `auth.error`。
- 其他请求失败返回 `sys.error`。
- 解析 JSON 失败没有可靠 `requestId`，返回不带 `requestId` 的 `sys.error`。
- 未知异常统一转换为 `INTERNAL_ERROR`，日志记录原始错误，客户端只收到通用信息。

不要把以下信息返回给客户端：

- SQL 语句
- stack trace
- password hash
- JWT secret
- 文件系统路径
- 内部异常对象原文

必须覆盖的错误点：

| 场景 | 错误码 |
| --- | --- |
| 非 JSON | `BAD_JSON` |
| envelope 不是 object | `BAD_REQUEST` |
| `type` 缺失 | `BAD_REQUEST` |
| 未知 `type` | `UNKNOWN_TYPE` |
| 未登录访问业务接口 | `UNAUTHORIZED` |
| token 无效 | `TOKEN_INVALID` |
| 用户名已存在 | `USERNAME_EXISTS` |
| 用户名或密码错误 | `INVALID_CREDENTIALS` |
| 目标用户不存在 | `USER_NOT_FOUND` |
| 添加自己 | `CANNOT_ADD_SELF` |
| 已经是好友 | `FRIEND_ALREADY_EXISTS` |
| 申请已存在 | `FRIEND_REQUEST_EXISTS` |
| 申请不存在 | `FRIEND_REQUEST_NOT_FOUND` |
| 非好友发消息 | `NOT_FRIEND` |
| 空消息 | `MESSAGE_EMPTY` |
| 消息过长 | `MESSAGE_TOO_LONG` |
| 限流 | `RATE_LIMITED` |
| 未预期异常 | `INTERNAL_ERROR` |

## 14. 限流与输入校验

### 14.1 单连接限流

简单实现：

```text
每个 ctx 保存 rateWindowStartedAt 和 rateWindowCount
如果当前时间超过窗口 1 秒，重置窗口
窗口内超过 IM_RATE_LIMIT_PER_SEC：
  ├─ 返回 RATE_LIMITED
  └─ 严重时关闭连接
```

心跳也计入限流即可，Phase 1 不需要复杂豁免。

### 14.2 输入校验

建议规则：

| 字段 | 规则 |
| --- | --- |
| `username` | 3-32 字符，`^[a-zA-Z0-9_-]+$` |
| `password` | 6-128 字符 |
| `displayName` | trim 后 1-32 字符 |
| `query` | trim 后 1-64 字符 |
| `content` | 不 trim 原文，但校验 trim 后非空，最大 4000 字符 |
| `msgType` | Phase 1 只允许 `text` |
| `limit` | 1-100，非法时使用默认 30 或返回 BAD_REQUEST，建议返回 BAD_REQUEST |
| `before` | 可选，必须是正整数 Unix 秒 |

服务端写 DB 前必须完成校验。

## 15. WebSocket 发送封装

不要在业务代码里直接到处调用 `ws.send(JSON.stringify(...))`。

统一封装：

```ts
send(ctx, message)
sendError(ctx, requestId, error)
sendAuthError(ctx, requestId, error)
pushToUser(userId, message)
```

发送前检查：

- `ctx.ws.readyState === WebSocket.OPEN`
- JSON 序列化不能失败
- 发送失败要返回 false，让调用方决定是否标记 delivered

推送给用户时：

```text
查 onlineUsers.get(userId)
  ├─ 不存在 -> false
  ├─ ws 非 OPEN -> 删除在线状态并返回 false
  └─ send 成功 -> true
```

## 16. 日志策略

Phase 1 可以用 `console` 封装，但日志必须分级。

建议日志：

- `info`: 服务启动、用户上线/下线、认证成功
- `warn`: 登录失败、token 无效、限流、非法请求、推送失败
- `error`: DB 错误、未捕获异常、启动失败

日志中不要打印：

- 明文密码
- token 完整值
- password hash
- JWT secret

token 如需排查，只打印前后少量字符，例如 `abc...xyz`。

## 17. 启动与关闭

启动流程：

```text
读取配置
创建数据目录
打开 SQLite
执行 schema/migration
创建 WebSocketServer
注册 connection handler
启动心跳检查定时器
打印监听地址
```

关闭流程：

```text
停止接受新连接
通知在线连接 sys.error SERVER_SHUTDOWN
关闭所有 WebSocket
清理 heartbeat timer
关闭 SQLite
退出进程
```

需要处理信号：

- `SIGINT`
- `SIGTERM`

Windows 下开发环境主要依赖 Ctrl+C，仍然可以注册这些信号。

## 18. 心跳与连接清理

客户端每 30 秒发 `ping`。

服务端每 30 秒扫描连接：

```text
now - ctx.lastMessageAt > IM_HEARTBEAT_TIMEOUT_MS
  ├─ 关闭连接
  └─ 触发下线流程
```

收到任何合法消息都可以更新 `lastMessageAt`，不只限 `ping`。

服务端收到 `ping`：

```text
返回 pong，payload.serverTime = 当前 Unix 秒
```

## 19. 事务要求

必须使用事务的场景：

- 注册用户写入。
- 添加好友写入两行关系。
- 接受好友更新两行关系。
- 删除好友删除两行关系。
- 批量标记离线消息 `delivered_at`。

建议使用 `better-sqlite3` transaction：

```ts
const tx = db.transaction((args) => {
  // multiple statements
});
```

事务内不要做 WebSocket 推送。先提交 DB，再推送事件。否则推送成功但事务回滚会造成状态不一致。

## 20. 并发与一致性

SQLite 是单进程内同步写入。Phase 1 服务端单实例运行，避免复杂分布式问题。

需要注意：

- 同时互相添加好友时，要处理唯一键冲突。
- 接受好友时，如果另一边已删除申请，应返回 `FRIEND_REQUEST_NOT_FOUND`。
- 删除好友和发送消息并发时，以发送消息时的 DB 关系为准。
- 同用户重复登录时，只保留最后一个连接。

建议所有关系写操作使用 `INSERT ... ON CONFLICT` 或先查后事务写入，并捕获唯一键冲突转换为业务错误。

## 21. 服务端最小开发步骤

建议按以下顺序实现，保证每一步可验证。

### Step 1：启动与心跳

实现：

- `config.ts`
- `index.ts`
- `ws-handler.ts` 最小版
- `ping` / `pong`

验收：

- 服务能监听 `7654`。
- ws 客户端发送 `ping` 能收到 `pong`。
- 非 JSON 返回 `BAD_JSON`。

### Step 2：数据库

实现：

- `db.ts`
- 三张表 schema
- 数据目录创建

验收：

- 首次启动自动创建 DB。
- 重复启动不报表已存在。
- 能查看三张表。

### Step 3：认证

实现：

- `auth.register`
- `auth.login`
- `auth.token`
- 密码 hash
- JWT 签发与校验

验收：

- 注册成功返回 `auth.ok` 和 token。
- 重复 username 返回 `USERNAME_EXISTS`。
- 错误密码返回 `INVALID_CREDENTIALS`。
- token 登录成功。
- 无效 token 返回 `TOKEN_INVALID`。

### Step 4：连接上下文与在线表

实现：

- 认证后绑定 ctx
- `onlineUsers`
- 重复登录替换旧连接
- close/error 下线清理

验收：

- 未登录发 `friend.list` 返回 `UNAUTHORIZED`。
- 用户断开后从在线表移除。
- 同用户第二次登录，旧连接被关闭。

### Step 5：好友

实现：

- `friend.search`
- `friend.add`
- `friend.accept`
- `friend.list`
- 可选 `friend.remove`

验收：

- A 能搜索 B。
- A 添加 B，B 在线时收到 `friend.add_notify`。
- B 接受后双方 `friend.list` 都能看到 accepted。
- A/B 可以看到对方 online。

### Step 6：消息

实现：

- `msg.send`
- `msg.ack`
- `msg.new`
- 好友关系校验

验收：

- 非好友发消息返回 `NOT_FRIEND`。
- 好友在线时，发送方收到 ack，接收方收到 new。
- 消息入库。

### Step 7：离线消息

实现：

- 认证成功后查询未送达消息
- 推送 `sys.offline_msgs`
- 标记 `delivered_at`

验收：

- B 离线时 A 发消息只收到 ack。
- B 上线后收到 `sys.offline_msgs`。
- 同一离线消息不会重复推送。

### Step 8：已读和历史

实现：

- `msg.read`
- `msg.history`

验收：

- 接收方 read 后发送方在线能收到 `msg.read_notify`。
- 重启客户端后能通过 `msg.history` 拉回历史消息。

## 22. 手工测试矩阵

必须覆盖：

| 场景 | 预期 |
| --- | --- |
| 非 JSON 输入 | `BAD_JSON` |
| 未登录发业务请求 | `UNAUTHORIZED` |
| 注册新用户 | `auth.ok` |
| 注册重复用户名 | `USERNAME_EXISTS` |
| 登录错误密码 | `INVALID_CREDENTIALS` |
| token 登录 | `auth.ok` |
| 无效 token | `TOKEN_INVALID` |
| 搜索用户 | 返回用户列表且无敏感字段 |
| 添加自己 | `CANNOT_ADD_SELF` |
| 添加不存在用户 | `USER_NOT_FOUND` |
| 添加好友 | 双方关系 pending |
| 接受好友 | 双方关系 accepted |
| 非好友发消息 | `NOT_FRIEND` |
| 好友在线发消息 | ack + new |
| 好友离线发消息 | ack，消息未 delivered |
| 好友上线 | 收到 offline_msgs |
| 重复离线推送 | 不重复 |
| 已读消息 | read_ack + read_notify |
| 拉历史 | 返回双方消息 |
| 单连接限流 | `RATE_LIMITED` |
| 同用户重复登录 | 新连接有效，旧连接关闭 |
| 服务关闭 | 连接被关闭，不产生未捕获异常 |

## 23. 与 Electron 客户端的边界

服务端不关心 Electron UI。

服务端只暴露 WebSocket JSON 协议：

- 不直接调用 Electron IPC。
- 不读写客户端 `~/.neckcode/neckcode.db`。
- 不管理 Renderer 状态。
- 不嵌入 Agent runtime。

Electron 主进程后续通过 `im-client.ts` 连接该服务端，并负责：

- token 本地保存
- 自动重连
- 本地消息缓存
- IPC 转发给 Renderer

## 24. 待审阅决策点

以下点需要在实现前确认：

1. 密码哈希使用 `crypto.scryptSync` 还是新增 `bcrypt`。
2. 服务端代码是否放在根目录 `server/`，还是放进 `src/server/` 统一 TypeScript 构建。
3. 服务端 SQLite 默认路径是否使用项目目录 `server/data/im-server.db`，还是用户目录 `~/.neckcode/im-server.db`。
4. 离线消息是否接受“服务端推送后即标记 delivered”的 Phase 1 简化方案。
5. 是否第一版就实现 `msg.history`，建议实现，因为它可以修复离线消息 delivered 风险。
6. 是否第一版实现 `friend.remove` 和 `msg.read`，建议后置到第二批，但服务端设计已预留。
