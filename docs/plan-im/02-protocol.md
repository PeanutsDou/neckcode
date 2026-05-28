# IM Phase 1 通信协议

> 状态：草案，待审阅  
> 范围：一对一 IM，不包含群组、文件传输、Agent 协作

## 1. 目标

本文定义 Neck Code 客户端与 IM Server 之间的 WebSocket JSON 协议。

协议需要解决：

- 客户端如何注册、登录、使用 token 恢复登录
- 客户端如何搜索、添加、接受、删除好友
- 客户端如何发送一对一文字消息
- 服务端如何回执、推送新消息、推送离线消息
- 服务端如何通知好友在线状态
- 错误如何统一表达

Phase 1 只支持一对一文字聊天。群组、文件、图片、语音、消息撤回、端到端加密、Agent 接入均不在本文范围内。

## 2. 连接生命周期

客户端通过 WebSocket 连接 IM Server。

默认地址：

```text
ws://<host>:7654
```

生产环境可以切换为：

```text
wss://<host>:7654
```

连接建立后的流程：

1. 客户端建立 WebSocket 连接。
2. 客户端发送 `auth.login`、`auth.register` 或 `auth.token`。
3. 服务端认证成功后返回 `auth.ok`。
4. 认证成功后，客户端才允许发送好友、消息、在线状态相关请求。
5. 服务端在认证成功后推送离线消息和在线状态。
6. 客户端每 30 秒发送 `ping`。
7. 服务端返回 `pong`。
8. 连接断开后，客户端主进程负责重连，并优先使用本地 token 发送 `auth.token`。

认证前只允许以下消息：

- `auth.register`
- `auth.login`
- `auth.token`
- `ping`

认证前发送其他消息，服务端返回 `sys.error`，然后可以断开连接。

## 3. 通用消息结构

所有 WebSocket 消息都是 JSON 对象。

客户端发送：

```json
{
  "type": "msg.send",
  "requestId": "req_018f9d9f0d8a",
  "payload": {}
}
```

服务端返回或推送：

```json
{
  "type": "msg.ack",
  "requestId": "req_018f9d9f0d8a",
  "payload": {}
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 是 | 消息类型，使用 `domain.action` 命名 |
| `requestId` | string | 客户端请求必填 | 客户端生成，用于匹配回执；服务端主动推送可以不带 |
| `payload` | object | 否 | 消息体；无参数时可以省略或传 `{}` |

约定：

- `requestId` 由客户端生成，建议使用 UUID 或带随机后缀的字符串。
- 服务端对客户端请求的直接响应应原样带回 `requestId`。
- 服务端主动推送事件不需要 `requestId`。
- 时间戳统一使用 Unix 秒级时间戳。
- ID 统一使用字符串，建议服务端生成 UUID。
- 字段名统一使用 camelCase。
- 未知字段应被接收方忽略，以便后续兼容扩展。

## 4. 用户对象

协议中出现的用户对象统一使用以下结构。

```json
{
  "userId": "u_123",
  "username": "alice",
  "displayName": "Alice",
  "avatar": null
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `userId` | string | 是 | 用户唯一 ID，不可修改 |
| `username` | string | 是 | 登录名，唯一 |
| `displayName` | string | 是 | 展示名称 |
| `avatar` | string \| null | 否 | 头像 URL，Phase 1 可为空 |

## 5. 认证协议

### 5.1 注册

客户端发送：

```json
{
  "type": "auth.register",
  "requestId": "req_register_001",
  "payload": {
    "username": "alice",
    "password": "123456",
    "displayName": "Alice"
  }
}
```

服务端成功返回 `auth.ok`：

```json
{
  "type": "auth.ok",
  "requestId": "req_register_001",
  "payload": {
    "userId": "u_123",
    "username": "alice",
    "displayName": "Alice",
    "avatar": null,
    "token": "jwt-token",
    "expiresAt": 1780000000
  }
}
```

失败返回 `auth.error`：

```json
{
  "type": "auth.error",
  "requestId": "req_register_001",
  "payload": {
    "code": "USERNAME_EXISTS",
    "message": "用户名已存在"
  }
}
```

### 5.2 用户名密码登录

客户端发送：

```json
{
  "type": "auth.login",
  "requestId": "req_login_001",
  "payload": {
    "username": "alice",
    "password": "123456"
  }
}
```

服务端成功返回 `auth.ok`，结构同注册成功。

### 5.3 Token 登录

客户端发送：

```json
{
  "type": "auth.token",
  "requestId": "req_token_001",
  "payload": {
    "token": "jwt-token"
  }
}
```

服务端成功返回 `auth.ok`。

如果 token 过期或无效，服务端返回：

```json
{
  "type": "auth.error",
  "requestId": "req_token_001",
  "payload": {
    "code": "TOKEN_INVALID",
    "message": "登录已过期，请重新登录"
  }
}
```

## 6. 好友协议

好友关系采用双向关系。服务端可以在数据库中保存两条记录，也可以保存一条关系记录后在查询时双向展开，但协议层始终按双向好友理解。

### 6.1 搜索用户

客户端发送：

```json
{
  "type": "friend.search",
  "requestId": "req_friend_search_001",
  "payload": {
    "query": "alice"
  }
}
```

服务端返回：

```json
{
  "type": "friend.search_result",
  "requestId": "req_friend_search_001",
  "payload": {
    "users": [
      {
        "userId": "u_123",
        "username": "alice",
        "displayName": "Alice",
        "avatar": null,
        "relation": "none"
      }
    ]
  }
}
```

`relation` 可选值：

| 值 | 说明 |
| --- | --- |
| `self` | 当前用户自己 |
| `none` | 非好友，无申请 |
| `pending_sent` | 当前用户已发送申请 |
| `pending_received` | 当前用户已收到申请 |
| `accepted` | 已是好友 |
| `blocked` | 已屏蔽，Phase 1 可暂不实现 |

### 6.2 添加好友

客户端发送：

```json
{
  "type": "friend.add",
  "requestId": "req_friend_add_001",
  "payload": {
    "userId": "u_456"
  }
}
```

服务端返回：

```json
{
  "type": "friend.add_ack",
  "requestId": "req_friend_add_001",
  "payload": {
    "userId": "u_456",
    "status": "pending"
  }
}
```

如果目标用户在线，服务端向目标用户推送：

```json
{
  "type": "friend.add_notify",
  "payload": {
    "fromUser": {
      "userId": "u_123",
      "username": "alice",
      "displayName": "Alice",
      "avatar": null
    }
  }
}
```

### 6.3 接受好友申请

客户端发送：

```json
{
  "type": "friend.accept",
  "requestId": "req_friend_accept_001",
  "payload": {
    "userId": "u_123"
  }
}
```

服务端返回：

```json
{
  "type": "friend.accept_ack",
  "requestId": "req_friend_accept_001",
  "payload": {
    "friend": {
      "userId": "u_123",
      "username": "alice",
      "displayName": "Alice",
      "avatar": null,
      "status": "accepted",
      "online": true
    }
  }
}
```

如果申请方在线，服务端向申请方推送：

```json
{
  "type": "friend.accept_notify",
  "payload": {
    "fromUser": {
      "userId": "u_456",
      "username": "bob",
      "displayName": "Bob",
      "avatar": null
    }
  }
}
```

### 6.4 删除好友

客户端发送：

```json
{
  "type": "friend.remove",
  "requestId": "req_friend_remove_001",
  "payload": {
    "userId": "u_456"
  }
}
```

服务端返回：

```json
{
  "type": "friend.remove_ack",
  "requestId": "req_friend_remove_001",
  "payload": {
    "userId": "u_456"
  }
}
```

Phase 1 可以不向被删除方推送通知。被删除方下次请求好友列表时，以服务端结果为准。

### 6.5 获取好友列表

客户端发送：

```json
{
  "type": "friend.list",
  "requestId": "req_friend_list_001",
  "payload": {}
}
```

服务端返回：

```json
{
  "type": "friend.list_result",
  "requestId": "req_friend_list_001",
  "payload": {
    "friends": [
      {
        "userId": "u_456",
        "username": "bob",
        "displayName": "Bob",
        "avatar": null,
        "status": "accepted",
        "online": true,
        "lastSeenAt": 1780000000
      }
    ],
    "requests": [
      {
        "userId": "u_789",
        "username": "carol",
        "displayName": "Carol",
        "avatar": null,
        "status": "pending_received",
        "createdAt": 1780000000
      }
    ]
  }
}
```

## 7. 私聊消息协议

### 7.1 发送消息

客户端发送：

```json
{
  "type": "msg.send",
  "requestId": "req_msg_send_001",
  "payload": {
    "toUser": "u_456",
    "content": "你好",
    "msgType": "text"
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `toUser` | string | 是 | 接收方 userId |
| `content` | string | 是 | 消息内容 |
| `msgType` | string | 否 | 默认 `text`，Phase 1 只允许 `text` |

服务端处理顺序：

1. 校验当前连接已登录。
2. 校验 `toUser` 存在。
3. 校验双方是已接受好友关系。
4. 写入 `direct_messages`。
5. 给发送方返回 `msg.ack`。
6. 如果接收方在线，推送 `msg.new`。
7. 如果推送成功，更新 `deliveredAt`。

服务端返回发送回执：

```json
{
  "type": "msg.ack",
  "requestId": "req_msg_send_001",
  "payload": {
    "messageId": "m_001",
    "toUser": "u_456",
    "createdAt": 1780000123
  }
}
```

接收方在线时，服务端推送：

```json
{
  "type": "msg.new",
  "payload": {
    "messageId": "m_001",
    "fromUser": "u_123",
    "fromName": "Alice",
    "toUser": "u_456",
    "content": "你好",
    "msgType": "text",
    "createdAt": 1780000123
  }
}
```

### 7.2 离线消息

用户认证成功后，服务端查询该用户未送达消息：

```sql
to_user = currentUserId AND delivered_at IS NULL
```

然后推送：

```json
{
  "type": "sys.offline_msgs",
  "payload": {
    "messages": [
      {
        "messageId": "m_001",
        "fromUser": "u_123",
        "fromName": "Alice",
        "toUser": "u_456",
        "content": "你好",
        "msgType": "text",
        "createdAt": 1780000123
      }
    ]
  }
}
```

服务端推送 `sys.offline_msgs` 后，可以将这些消息标记为已送达。

### 7.3 已读

客户端在用户打开聊天窗口并看到消息后发送：

```json
{
  "type": "msg.read",
  "requestId": "req_msg_read_001",
  "payload": {
    "messageId": "m_001"
  }
}
```

服务端返回：

```json
{
  "type": "msg.read_ack",
  "requestId": "req_msg_read_001",
  "payload": {
    "messageId": "m_001",
    "readAt": 1780000200
  }
}
```

如果原发送方在线，服务端向原发送方推送：

```json
{
  "type": "msg.read_notify",
  "payload": {
    "messageId": "m_001",
    "fromUser": "u_456",
    "readAt": 1780000200
  }
}
```

Phase 1 可以先实现 `msg.read` 的服务端存储，UI 是否展示已读状态可后置。

### 7.4 拉取历史消息

为支持客户端重启后的本地缓存修复，建议保留历史拉取接口。

客户端发送：

```json
{
  "type": "msg.history",
  "requestId": "req_msg_history_001",
  "payload": {
    "peerUser": "u_456",
    "before": 1780000123,
    "limit": 30
  }
}
```

服务端返回：

```json
{
  "type": "msg.history_result",
  "requestId": "req_msg_history_001",
  "payload": {
    "peerUser": "u_456",
    "messages": [
      {
        "messageId": "m_001",
        "fromUser": "u_123",
        "toUser": "u_456",
        "content": "你好",
        "msgType": "text",
        "createdAt": 1780000123,
        "deliveredAt": 1780000124,
        "readAt": null
      }
    ]
  }
}
```

约定：

- `limit` 默认 30，最大 100。
- `before` 为空时，从最新消息开始倒序拉取。
- 服务端返回时建议按 `createdAt` 升序排列，方便 UI 直接追加。

## 8. 在线状态协议

### 8.1 上线通知

用户认证成功后，服务端向其在线好友推送：

```json
{
  "type": "presence.online",
  "payload": {
    "userId": "u_123",
    "status": "online"
  }
}
```

### 8.2 下线通知

用户连接断开后，服务端向其在线好友推送：

```json
{
  "type": "presence.offline",
  "payload": {
    "userId": "u_123",
    "lastSeenAt": 1780000300
  }
}
```

### 8.3 设置状态

客户端发送：

```json
{
  "type": "presence.status",
  "requestId": "req_presence_status_001",
  "payload": {
    "status": "away"
  }
}
```

`status` 可选值：

| 值 | 说明 |
| --- | --- |
| `online` | 在线 |
| `away` | 离开 |
| `busy` | 忙碌 |

服务端返回：

```json
{
  "type": "presence.status_ack",
  "requestId": "req_presence_status_001",
  "payload": {
    "status": "away"
  }
}
```

同时服务端向在线好友推送：

```json
{
  "type": "presence.status_notify",
  "payload": {
    "userId": "u_123",
    "status": "away"
  }
}
```

Phase 1 可以先只实现 `online` / `offline`，`away` 和 `busy` 可作为兼容字段保留。

## 9. 心跳协议

客户端每 30 秒发送：

```json
{
  "type": "ping",
  "requestId": "req_ping_001",
  "payload": {}
}
```

服务端返回：

```json
{
  "type": "pong",
  "requestId": "req_ping_001",
  "payload": {
    "serverTime": 1780000000
  }
}
```

如果服务端连续 90 秒未收到客户端消息，可以关闭连接。

如果客户端连续两次心跳未收到 `pong`，应主动断开并重连。

## 10. 错误协议

认证错误使用 `auth.error`。

其他错误统一使用 `sys.error`。

```json
{
  "type": "sys.error",
  "requestId": "req_msg_send_001",
  "payload": {
    "code": "NOT_FRIEND",
    "message": "只能给好友发送消息",
    "details": {}
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | string | 是 | 稳定错误码，供客户端判断 |
| `message` | string | 是 | 面向用户或开发者的错误说明 |
| `details` | object | 否 | 调试信息，不保证稳定 |

错误码：

| code | 说明 |
| --- | --- |
| `BAD_JSON` | 消息不是合法 JSON |
| `BAD_REQUEST` | 消息结构错误 |
| `UNKNOWN_TYPE` | 未知消息类型 |
| `UNAUTHORIZED` | 未登录 |
| `TOKEN_INVALID` | token 无效或过期 |
| `USERNAME_EXISTS` | 用户名已存在 |
| `INVALID_CREDENTIALS` | 用户名或密码错误 |
| `USER_NOT_FOUND` | 用户不存在 |
| `CANNOT_ADD_SELF` | 不能添加自己 |
| `FRIEND_ALREADY_EXISTS` | 已经是好友 |
| `FRIEND_REQUEST_EXISTS` | 好友申请已存在 |
| `FRIEND_REQUEST_NOT_FOUND` | 好友申请不存在 |
| `NOT_FRIEND` | 不是好友 |
| `MESSAGE_EMPTY` | 消息内容为空 |
| `MESSAGE_TOO_LONG` | 消息过长 |
| `RATE_LIMITED` | 请求过于频繁 |
| `INTERNAL_ERROR` | 服务端内部错误 |

## 11. 鉴权与校验规则

基础规则：

- 除认证和心跳外，所有消息必须在认证成功后发送。
- 服务端必须从连接绑定的 `userId` 判断当前用户，不能信任客户端传入的发送方 ID。
- `msg.send` 的发送方永远是当前连接用户。
- `friend.*`、`msg.*` 请求都需要校验目标用户是否存在。
- `msg.send` 需要校验双方是否是 `accepted` 好友关系。
- `msg.read` 只能由消息接收方发送。
- 搜索用户时不返回密码、token、内部安全字段。

输入限制建议：

| 字段 | 限制 |
| --- | --- |
| `username` | 3-32 字符，仅允许字母、数字、下划线、短横线 |
| `password` | 6-128 字符 |
| `displayName` | 1-32 字符 |
| `content` | 1-4000 字符 |
| `query` | 1-64 字符 |

频率限制建议：

- 单连接每秒最多 20 条消息。
- 登录失败可按用户名或 IP 做短时间限制。
- 搜索用户建议做节流，避免输入框每个字符都直接打到服务端。

## 12. 客户端本地处理约定

Electron 主进程负责 IM WebSocket，不建议 Renderer 直接连接服务端。

主进程职责：

- 保存当前登录用户和 token
- 建立 WebSocket 连接
- token 自动登录
- 断线重连
- 心跳
- 接收服务端事件
- 写入本地缓存
- 通过 IPC 通知 Renderer

Renderer 职责：

- 展示登录状态
- 展示好友列表
- 展示好友请求
- 展示聊天消息
- 调用 preload 暴露的 IM API

建议 Renderer 不直接理解 WebSocket 连接细节，只消费主进程转发的领域事件。

## 13. 兼容性约定

为方便后续 Phase 2 扩展，协议保留以下约定：

- 所有消息都必须带 `type`，不得依赖路径或连接状态推断业务类型。
- 接收方必须忽略未知字段。
- 新增消息类型不应破坏已有消息类型。
- `msgType` Phase 1 只支持 `text`，后续可扩展为 `image`、`file`、`system`。
- `presence.status` Phase 1 可只实现 `online` / `offline`，后续再扩展状态。
- 错误码一旦被客户端依赖，不应随意改名。
- 服务端主动推送不保证一定到达，客户端需要能通过 `friend.list` 和 `msg.history` 修复状态。

## 14. Phase 1 最小必需消息清单

第一版必须实现：

| 类型 | 方向 | 说明 |
| --- | --- | --- |
| `auth.register` | C -> S | 注册 |
| `auth.login` | C -> S | 用户名密码登录 |
| `auth.token` | C -> S | token 登录 |
| `auth.ok` | S -> C | 认证成功 |
| `auth.error` | S -> C | 认证失败 |
| `friend.search` | C -> S | 搜索用户 |
| `friend.search_result` | S -> C | 搜索结果 |
| `friend.add` | C -> S | 添加好友 |
| `friend.add_ack` | S -> C | 添加好友回执 |
| `friend.add_notify` | S -> C | 收到好友申请 |
| `friend.accept` | C -> S | 接受好友 |
| `friend.accept_ack` | S -> C | 接受好友回执 |
| `friend.accept_notify` | S -> C | 好友申请被接受 |
| `friend.list` | C -> S | 获取好友列表 |
| `friend.list_result` | S -> C | 好友列表 |
| `msg.send` | C -> S | 发送消息 |
| `msg.ack` | S -> C | 发送回执 |
| `msg.new` | S -> C | 新消息推送 |
| `sys.offline_msgs` | S -> C | 离线消息推送 |
| `presence.online` | S -> C | 好友上线 |
| `presence.offline` | S -> C | 好友下线 |
| `ping` | C -> S | 心跳 |
| `pong` | S -> C | 心跳响应 |
| `sys.error` | S -> C | 通用错误 |

第二批可以实现：

| 类型 | 方向 | 说明 |
| --- | --- | --- |
| `friend.remove` | C -> S | 删除好友 |
| `friend.remove_ack` | S -> C | 删除好友回执 |
| `msg.read` | C -> S | 标记已读 |
| `msg.read_ack` | S -> C | 已读回执 |
| `msg.read_notify` | S -> C | 已读通知 |
| `msg.history` | C -> S | 拉取历史 |
| `msg.history_result` | S -> C | 历史消息结果 |
| `presence.status` | C -> S | 设置状态 |
| `presence.status_ack` | S -> C | 设置状态回执 |
| `presence.status_notify` | S -> C | 状态变化通知 |
