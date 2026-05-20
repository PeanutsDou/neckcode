# IM Phase 1 Electron 主进程设计

> 状态：草案，待审阅  
> 依赖：[01-architecture.md](./01-architecture.md)、[02-protocol.md](./02-protocol.md)、[03-database.md](./03-database.md)

## 1. 目标

Electron 主进程是 Renderer 与 IM Server 之间的唯一桥接层。

主进程负责：

- WebSocket 连接 IM Server
- 登录、注册、token 自动登录
- 断线重连和心跳
- 请求 requestId 管理
- 服务端事件落本地缓存
- IPC API 暴露给 Renderer
- IM 事件转发给 Renderer

Renderer 不直接连接 WebSocket，不直接访问 SQLite，不直接保存 token。

## 2. 文件结构

建议新增：

```text
src/main/im/
  im-client.ts      # WebSocket 连接、请求响应、服务端事件
  im-store.ts       # 本地 SQLite 表初始化和读写
  im-ipc.ts         # IPC handler 和事件转发
  im-errors.ts      # 客户端侧错误归一化
  im-config.ts      # serverUrl、重连参数、心跳参数
src/shared/im-types.ts
```

主进程入口集成：

```ts
// src/main/index.ts
setupImIpcHandlers(() => mainWindow);
```

不要把大量 IM handler 直接堆进现有 `ipc-handlers.ts`。

## 3. im-client 职责

`im-client.ts` 是状态机，不负责 UI，不直接写 React store。

核心能力：

- `connect(serverUrl)`
- `disconnect()`
- `register(input)`
- `login(input)`
- `loginWithToken(token)`
- `sendRequest(type, payload, options)`
- `sendMessage(toUser, content)`
- `listFriends()`
- `searchUsers(query)`
- `addFriend(userId)`
- `acceptFriend(userId)`
- `loadHistory(peerUser, before, limit)`
- 处理服务端 push

内部状态：

```ts
type ImConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'online'
  | 'reconnecting'
  | 'offline'
  | 'error';
```

连接状态只在主进程维护，Renderer 通过事件获取快照。

## 4. 请求 requestId 管理

主进程需要维护 pending 请求表：

```ts
interface PendingRequest {
  requestId: string;
  type: string;
  createdAt: number;
  timeout: NodeJS.Timeout;
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  localMessageId?: string;
}

pendingRequests: Map<string, PendingRequest>
```

规则：

- 每个客户端请求必须生成 requestId。
- 收到带 requestId 的响应后，匹配 pending request。
- `sys.error` / `auth.error` 带 requestId 时，reject 对应请求。
- 超时未响应，reject `REQUEST_TIMEOUT`。
- 连接断开时，所有 pending 请求 reject `CONNECTION_CLOSED`。

默认超时：

| 请求 | 超时 |
| --- | --- |
| auth | 10s |
| friend | 10s |
| msg.send | 15s |
| msg.history | 15s |
| ping | 5s |

## 5. 连接生命周期

### 5.1 启动恢复

应用启动后：

```text
im-store 读取 im_local_user
  ├─ 无本地用户 -> state idle
  └─ 有 token -> connect(serverUrl)
       └─ auth.token
            ├─ 成功 -> online
            └─ 失败 -> 清理 token，进入 idle
```

token 失败处理：

- `TOKEN_INVALID`：清理本地 token，Renderer 显示登录页。
- 网络失败：保留 token，进入 offline/reconnecting。

### 5.2 手动登录

```text
Renderer imLogin
  -> im-client connect if needed
  -> auth.login
  -> auth.ok
  -> im-store save local user
  -> request friend.list
  -> emit auth-state and friends
```

### 5.3 断线重连

断线时：

```text
state = reconnecting
reject pending requests
emit connection event
按 backoff 重连
重连成功后 auth.token
auth.ok 后 friend.list
```

Backoff 建议：

```text
1s, 2s, 5s, 10s, 30s，之后固定 30s
```

用户手动 logout 后不重连。

## 6. 心跳

主进程负责心跳：

```text
online 后每 30s send ping
5s 未收到 pong -> 主动 close
进入 reconnecting
```

收到任意服务端消息都可以更新 `lastServerMessageAt`，但 pong 仍用于明确确认连接可用。

## 7. 服务端事件处理

服务端 push 分两类：

1. 可直接影响本地缓存的领域事件。
2. 只影响连接状态的系统事件。

### 7.1 `friend.add_notify`

处理：

```text
写 im_friend_requests direction=in
emit im:friend-request
emit im:state-updated
```

失败点：

- 本地 DB 写入失败：仍 emit 事件，但标记 `cacheError`。

### 7.2 `friend.accept_notify`

处理：

```text
upsert im_friends accepted
更新 outgoing request accepted
emit im:friends-updated
```

### 7.3 `msg.new`

处理：

```text
insert incoming message
upsert conversation
emit im:message-new
```

要求：

- 幂等，重复 messageId 不重复插入。
- 写入失败要 emit `im:error`。

### 7.4 `sys.offline_msgs`

处理：

```text
事务批量 insert incoming messages
批量 upsert conversations
emit im:offline-messages
```

### 7.5 `presence.online/offline/status_notify`

处理：

```text
更新 im_friends online/lastSeenAt
emit im:presence
```

## 8. 本地缓存接口

`im-store.ts` 提供：

```ts
initImStore(): void
getLocalUser(): LocalUser | null
saveLocalUser(user): void
clearLocalUser(): void
upsertFriends(ownerUserId, friends): void
listCachedFriends(ownerUserId): Friend[]
upsertFriendRequest(ownerUserId, request): void
listFriendRequests(ownerUserId): FriendRequest[]
insertMessage(ownerUserId, message): void
markLocalMessageSent(ownerUserId, localId, ack): void
markLocalMessageFailed(ownerUserId, localId, error): void
listMessages(ownerUserId, peerUserId, limit, before): DirectMessage[]
upsertConversation(ownerUserId, peerUserId, patch): void
listConversations(ownerUserId): Conversation[]
```

要求：

- 所有写入方法捕获 SQLite constraint 错误并转为业务错误。
- 重复服务端消息必须 insert ignore 或 upsert。
- 不向 Renderer 返回 token，除非是调试接口，正式 API 不允许。

## 9. IPC API

建议 preload 暴露以下 API。

### 9.1 认证

```ts
imGetAuthState(): Promise<ImAuthState>
imRegister(input): Promise<ImAuthState>
imLogin(input): Promise<ImAuthState>
imLogout(): Promise<void>
imReconnect(): Promise<void>
```

错误：

- `INVALID_CREDENTIALS`
- `USERNAME_EXISTS`
- `TOKEN_INVALID`
- `SERVER_UNAVAILABLE`

### 9.2 好友

```ts
imSearchUsers(query): Promise<SearchUser[]>
imListFriends(): Promise<{ friends: Friend[]; requests: FriendRequest[] }>
imAddFriend(userId): Promise<void>
imAcceptFriend(userId): Promise<void>
imRemoveFriend(userId): Promise<void>
```

### 9.3 消息

```ts
imSendMessage(input: { toUser: string; content: string }): Promise<SendMessageResult>
imListConversations(): Promise<Conversation[]>
imListMessages(peerUserId: string, options): Promise<DirectMessage[]>
imLoadHistory(peerUserId: string, options): Promise<DirectMessage[]>
imMarkRead(messageId: string): Promise<void>
```

### 9.4 事件

```ts
onImAuthState(cb)
onImConnectionState(cb)
onImFriendsUpdated(cb)
onImFriendRequest(cb)
onImMessageNew(cb)
onImConversationUpdated(cb)
onImPresence(cb)
onImError(cb)
```

每个监听函数必须返回 unsubscribe。

## 10. IPC 安全校验

主进程 IPC handler 必须校验 Renderer 参数。

示例：

| API | 校验 |
| --- | --- |
| `imLogin` | username/password 非空字符串 |
| `imSearchUsers` | query trim 后 1-64 |
| `imAddFriend` | userId 非空字符串 |
| `imSendMessage` | toUser 非空，content trim 后非空，长度 <= 4000 |
| `imListMessages` | peerUserId 非空，limit 合法 |

Renderer 参数错误应在主进程返回 `BAD_REQUEST`，不要发送到服务端。

## 11. 乐观发送

消息发送建议做乐观 UI：

```text
Renderer 调 imSendMessage
主进程生成 localId
写 pending 消息
emit conversation/message update
发送 msg.send
收到 msg.ack -> sent
收到 sys.error/timeout -> failed
```

优点：

- UI 响应快。
- 断网或失败时有明确状态。

必须支持：

- failed 消息重试。
- ack 回来但本地 pending 不存在时修复插入。

## 12. 登出

用户登出：

```text
停止重连
关闭 WebSocket
reject pending requests
清理 current user/token
可保留消息缓存
emit auth-state loggedOut
```

不建议登出时删除历史消息。删除缓存应作为单独设置项。

## 13. 错误归一化

主进程对外统一错误结构：

```ts
interface ImClientError {
  code: string;
  message: string;
  source: 'server' | 'client' | 'network' | 'cache';
  retryable: boolean;
}
```

示例：

| 场景 | code | source | retryable |
| --- | --- | --- | --- |
| 服务端不可达 | `SERVER_UNAVAILABLE` | network | true |
| 请求超时 | `REQUEST_TIMEOUT` | network | true |
| token 失效 | `TOKEN_INVALID` | server | false |
| 本地 DB 写失败 | `CACHE_WRITE_FAILED` | cache | true |
| Renderer 参数错误 | `BAD_REQUEST` | client | false |

## 14. 与现有代码的集成风险

| 风险 | 处理 |
| --- | --- |
| `ipc-handlers.ts` 继续膨胀 | IM IPC 单独文件，只在入口注册 |
| preload 类型缺失 | 新增共享类型，必要时补 `global.d.ts` |
| 本地 DB 连接重复 | 复用或封装现有 DB 创建逻辑，避免两个连接互相锁 |
| IM 状态影响 Agent | IM store 独立，不写 chat-store |
| 连接失败导致应用启动失败 | IM 初始化失败只影响 IM，不阻塞主窗口 |

## 15. 验收点

主进程层完成标准：

- 无 Renderer 直连 WebSocket。
- 登录成功后 token 写入本地。
- 应用重启后能 token 自动登录。
- 服务端断开后进入 reconnecting。
- 重连后自动 `friend.list` 修复状态。
- 收到 `msg.new` 能写入本地缓存并通知 Renderer。
- 离线消息批量写入幂等。
- 请求超时、服务端错误、网络错误、本地 DB 错误都能转成统一错误。

## 16. 待确认点

1. IM Server URL 配置入口放在哪里：设置页、配置文件，还是先写死开发地址。
2. 本地 token 是否加密存储。建议复用项目现有 secrets 机制，但第一版可先明文存在 SQLite，前提是不暴露给 Renderer。
3. pending 消息本地 ID 方案。建议增加 `local_id`。
4. 是否第一版做自动重试发送。建议不自动重试，由用户手动重试。

