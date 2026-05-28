# IM Phase 1 总体架构

> 状态：草案，待审阅  
> 依赖：[00-overview.md](./00-overview.md)、[02-protocol.md](./02-protocol.md)

## 1. 架构目标

架构目标是让 IM 能力独立演进，同时不破坏现有 Agent 应用。

核心要求：

- IM Server 独立进程，负责网络、账号、好友和消息。
- Electron 主进程负责连接 IM Server 和本地缓存。
- Renderer 只通过 preload 调用主进程 API。
- Agent 会话与 IM 聊天保持隔离。
- Phase 2 可在此基础上扩展群组和 Agent 协作。

## 2. 总体拓扑

```text
┌────────────────────────────────────────────┐
│              IM Server                     │
│  Node.js + ws + SQLite                     │
│                                            │
│  auth / friends / messages / presence      │
└────────────────────────────────────────────┘
       ▲                                ▲
       │ WebSocket JSON                 │ WebSocket JSON
       ▼                                ▼
┌──────────────────────┐        ┌──────────────────────┐
│ Neck Code Client │        │ Neck Code Client │
│                      │        │                      │
│ Main Process          │        │ Main Process          │
│  ├─ im-client         │        │  ├─ im-client         │
│  ├─ im-store          │        │  ├─ im-store          │
│  └─ im-ipc            │        │  └─ im-ipc            │
│        ▲              │        │        ▲              │
│        │ IPC/preload  │        │        │ IPC/preload  │
│        ▼              │        │        ▼              │
│ Renderer              │        │ Renderer              │
│  ├─ imStore           │        │  ├─ imStore           │
│  └─ IM UI             │        │  └─ IM UI             │
└──────────────────────┘        └──────────────────────┘
```

## 3. 进程职责

### 3.1 IM Server

负责：

- WebSocket 连接管理
- 注册、登录、token 验证
- 用户、好友、消息持久化
- 在线用户 Map
- 好友上下线广播
- 消息 ack、在线推送、离线推送
- 限流、输入校验、错误码

不负责：

- Electron IPC
- Renderer 状态
- 本地缓存
- Agent runtime
- UI 展示

### 3.2 Electron 主进程

负责：

- 建立与 IM Server 的 WebSocket 连接
- 登录态本地保存
- token 自动登录
- 断线重连
- 心跳
- 把服务端事件写入本地缓存
- 把服务端事件转成 IPC 事件发给 Renderer
- 接收 Renderer 调用并转成 WebSocket 请求

不负责：

- 服务端权限判断
- 伪造服务端状态
- 直接改写 Agent 会话

### 3.3 Preload

负责：

- 暴露安全的 `window.electronAPI.im*` 方法
- 暴露 IM 事件监听和取消监听方法
- 不暴露 Node.js、WebSocket、数据库对象给 Renderer

### 3.4 Renderer

负责：

- 登录/注册表单
- IM 页面状态管理
- 好友列表、好友申请、聊天窗口展示
- 用户交互
- 错误提示

不负责：

- 直接连接 WebSocket
- 直接访问 SQLite
- 保存 token 到 localStorage
- 直接处理 JWT

## 4. 模块边界

### 4.1 服务端模块

```text
server/
  ws-handler.ts  # 协议入口
  auth.ts        # 账号
  friends.ts     # 好友
  messages.ts    # 消息
  presence.ts    # 在线状态
  db.ts          # SQLite
```

边界要求：

- `ws-handler.ts` 不写 SQL。
- `auth.ts` 不推送好友消息。
- `friends.ts` 不处理 WebSocket 连接生命周期。
- `messages.ts` 不信任客户端 fromUser。
- `presence.ts` 不写 direct_messages。

### 4.2 客户端主进程模块

```text
src/main/im/
  im-client.ts
  im-store.ts
  im-ipc.ts
  im-types.ts 或复用 src/shared/im-types.ts
```

边界要求：

- `im-client.ts` 只处理连接、请求、事件。
- `im-store.ts` 只处理本地 SQLite 缓存。
- `im-ipc.ts` 只注册 IPC handler 和事件转发。
- 不把 IM 逻辑混入现有 `ipc-handlers.ts` 大文件，除非只做一次 `setupImIpcHandlers()` 调用。

### 4.3 Renderer 模块

```text
src/renderer/stores/im-store.ts
src/renderer/pages/LoginPage.tsx
src/renderer/components/im/
  ImShell.tsx
  FriendList.tsx
  FriendSearchDialog.tsx
  FriendRequests.tsx
  DirectChat.tsx
  MessageComposer.tsx
```

边界要求：

- IM store 不复用 Agent `chat-store`。
- IM 消息组件可以复用视觉样式，但不要复用 Agent 消息运行状态。
- UI 只消费主进程事件，不直接解析服务端连接细节。

## 5. 数据流

### 5.1 登录

```text
Renderer LoginPage
  -> preload imLogin(username, password)
  -> main im-ipc
  -> im-client sends auth.login
  -> IM Server auth.ok
  -> im-client stores user/token via im-store
  -> im-ipc emits im:auth-state
  -> Renderer imStore updates currentUser
```

错误点：

- 网络未连接
- 服务端不可达
- `INVALID_CREDENTIALS`
- `TOKEN_INVALID`
- 本地 token 写入失败

### 5.2 好友申请

```text
A Renderer
  -> imAddFriend(B)
  -> Server friend.add_ack
  -> A local relation pending_sent

B Server push friend.add_notify
  -> B im-client
  -> B im-store save request
  -> B Renderer event
```

错误点：

- 添加自己
- 用户不存在
- 已是好友
- 重复申请
- B 不在线时通知不会实时到达，B 后续通过 friend.list 修复

### 5.3 在线消息

```text
A Renderer send
  -> main imSendMessage
  -> local optimistic message pending
  -> server msg.send
  -> server insert DB
  -> A msg.ack
  -> A local message sent
  -> B msg.new
  -> B local insert
  -> B Renderer update
```

错误点：

- 非好友
- 内容为空
- 内容过长
- 接收方不存在
- 服务端入库失败
- ack 超时
- B 推送失败

### 5.4 离线消息

```text
B offline
A sends message
  -> server stores with delivered_at NULL

B reconnects
  -> auth.token
  -> auth.ok
  -> server sys.offline_msgs
  -> B local insert
  -> B Renderer update
  -> server marks delivered_at
```

修复路径：

- 如果 B 收到离线推送后本地写入失败，客户端后续可调用 `msg.history` 修复。

## 6. 状态来源优先级

客户端状态来源按优先级：

1. 服务端实时事件
2. 服务端请求响应
3. 本地 SQLite 缓存
4. Renderer 内存状态

规则：

- 服务端是好友关系和消息权限的权威来源。
- 本地缓存只用于启动展示、断网展示、历史恢复。
- Renderer 内存状态可以乐观更新，但必须能被服务端结果覆盖。

## 7. 与现有项目集成点

### 7.1 `src/main/index.ts`

新增：

```ts
setupImIpcHandlers(mainWindow);
```

不应改动 Agent runtime 创建逻辑。

### 7.2 `src/main/preload.ts`

新增 IM API：

```ts
imLogin
imRegister
imLogout
imGetAuthState
imListFriends
imSearchUsers
imAddFriend
imAcceptFriend
imSendMessage
imLoadHistory
onImEvent
```

### 7.3 `src/renderer/App.tsx`

新增模式切换：

```text
[IM] [Agent]
```

切换只影响中间内容区，不销毁 Agent 会话状态。

### 7.4 `src/shared`

新增：

```text
src/shared/im-types.ts
```

用于共享：

- WebSocket message type
- IPC payload type
- user/friend/message model type

## 8. 故障边界

### 8.1 IM Server 崩溃

客户端表现：

- 主进程连接断开。
- Renderer 显示离线/重连中。
- 发送消息进入失败或 pending 后超时。
- 不影响 Agent 会话。

### 8.2 Electron 主进程 IM client 崩溃

理想情况下不应崩溃。所有错误必须 catch 并转成事件。

可能错误：

- WebSocket 库异常
- JSON parse 异常
- 本地 SQLite 写入失败
- IPC handler 参数错误

处理：

- 记录日志
- Renderer 显示错误
- 连接层尝试恢复

### 8.3 Renderer 崩溃

主进程连接可继续存在。

Renderer 重载后：

- 调用 `imGetAuthState`
- 调用 `imListFriends`
- 从本地缓存加载消息

## 9. Phase 2 预留

Phase 2 需要新增：

- room table
- room_members table
- room_messages table
- room.* 协议
- agent session 与 room 绑定

Phase 1 预留但不实现：

- `msgType`
- `system` 消息
- `presence.status`
- `msg.history`
- 用户对象中的 `avatar`

预留字段不能影响 Phase 1 实现复杂度。

