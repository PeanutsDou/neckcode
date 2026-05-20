# PLAN-IM — 即时通讯模块开发文档

> 版本：0.1.0  
> 状态：规划中  
> 依赖：DeepSeek Code master

---

## 一、概述

### 1.1 目标

在 DeepSeek Code（桌面 AI Agent 应用）基础上，新增即时通讯能力，最终演进为 **多人共享 AI Agent 的协作空间**。

### 1.2 分阶段路线

```
Phase 1 — 一对一 IM（本文档）
  ├── 账号注册 / 登录
  ├── 好友系统（查询、添加、列表）
  ├── 一对一即时通讯（文字）
  └── Agent 暂不接入

Phase 2 — 群组 Agent 协作（后续规划）
  ├── 群组 / 房间
  ├── 多人共享 Agent 会话
  └── Agent 感知群组成员身份
```

### 1.3 设计原则

- **最小侵入**：现有 Agent 会话功能完全不动，IM 作为独立模块并行
- **服务端极轻**：消息中转 + 持久化，不承担 LLM 推理
- **渐进式**：Phase 1 稳定后，再在 Phase 2 逐步引入 Agent

---

## 二、Phase 1 架构

### 2.1 拓扑

```
┌─────────────────────────────────────────────────┐
│                   IM Server                       │
│            (Node.js + WebSocket + SQLite)        │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ users    │  │ friends  │  │direct_messages│ │
│  │ 表       │  │ 表       │  │ 表             │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  online_users (内存 Map<userId, ws>)     │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  WebSocket Server 监听 :7654                     │
└────────┬────────────────────────────────────────┘
         │  wss://server:7654
         │
    ┌────┴────┐          ┌────┴────┐
    │ Client A │          │ Client B │
    │ DS Code  │          │ DS Code  │
    │          │          │          │
    │ IPC ════ │ Agent    │ IPC ════ │ Agent
    │ WS  ──── │ IM       │ WS  ──── │ IM
    └──────────┘          └──────────┘
```

### 2.2 关键决策

| 决策 | 结论 | 理由 |
|------|------|------|
| 服务端部署 | 独立 Node.js 进程 | 服务器持续在线，用户可随时离线/上线 |
| 通信协议 | WebSocket（ws 库） | 双向推送，低延迟，纯文本消息 |
| 数据库 | better-sqlite3 | 与客户端一致，单文件零配置，够用 |
| 认证 | 密码 + JWT token | 简单成熟，无外部依赖 |
| 文件传输 | Phase 1 不做 | 纯文字消息，后续考虑 WebRTC |
| 群组 | Phase 1 不做 | 先稳定一对一 |

### 2.3 与现有系统关系

```
DeepSeek Code 主进程
  ├── Agent 会话 ── IPC ── Renderer（现有，不动）
  └── IM 模块 ──── WS ──── IM Server ──── 其他客户端
       │
       └── 通过相同的 Renderer 展示，只是入口不同
```

---

## 三、数据模型

### 3.1 服务端表

```sql
-- 用户
CREATE TABLE users (
    id          TEXT PRIMARY KEY,      -- UUID，不可改
    username    TEXT NOT NULL UNIQUE,  -- 登录名，唯一
    password    TEXT NOT NULL,         -- bcrypt hash
    display_name TEXT NOT NULL,       -- 显示名称，可修改
    avatar      TEXT,                  -- avatar URL，可选
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 好友关系
CREATE TABLE friends (
    user_id     TEXT NOT NULL,
    friend_id   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'accepted',  -- 'pending' | 'accepted' | 'blocked'
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id)
);

-- 一对一消息
CREATE TABLE direct_messages (
    id          TEXT PRIMARY KEY,      -- UUID
    from_user   TEXT NOT NULL,
    to_user     TEXT NOT NULL,
    content     TEXT NOT NULL,
    msg_type    TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'system'
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    delivered_at INTEGER,              -- 对方已送达
    read_at     INTEGER,               -- 对方已读
    FOREIGN KEY (from_user) REFERENCES users(id),
    FOREIGN KEY (to_user) REFERENCES users(id)
);

CREATE INDEX idx_dm_from_to ON direct_messages(from_user, to_user);
CREATE INDEX idx_dm_to_delivered ON direct_messages(to_user, delivered_at);
```

### 3.2 客户端存储（扩展）

客户端 SQLite（`deepseekcode.db`）新增：

```sql
-- 已登录用户信息缓存
CREATE TABLE local_user (
    user_id     TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    display_name TEXT NOT NULL,
    token       TEXT NOT NULL,         -- JWT
    token_exp   INTEGER NOT NULL       -- 过期时间戳
);

-- 好友列表缓存
CREATE TABLE local_friends (
    user_id     TEXT NOT NULL,
    friend_id   TEXT NOT NULL,
    friend_name TEXT NOT NULL,
    status      TEXT NOT NULL,
    PRIMARY KEY (user_id, friend_id)
);

-- 本地消息缓存（可选，加速 UI）
CREATE TABLE local_dm (
    id          TEXT PRIMARY KEY,
    peer_id     TEXT NOT NULL,          -- 对方 user_id
    direction   TEXT NOT NULL CHECK(direction IN ('out', 'in')),
    content     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE INDEX idx_local_dm_peer ON local_dm(peer_id, created_at);
```

---

## 四、通信协议

### 4.1 WebSocket 消息格式

所有消息 JSON 格式，`type` 字段区分：

```json
{
  "type": "msg.send",
  "requestId": "uuid",     // 客户端生成，回执用
  "payload": { ... }
}
```

### 4.2 消息类型定义

#### 认证类

| type | 方向 | payload | 说明 |
|------|------|---------|------|
| `auth.register` | C→S | `{ username, password, displayName }` | 注册 |
| `auth.login` | C→S | `{ username, password }` | 登录 |
| `auth.ok` | S→C | `{ userId, username, displayName, token, expiresAt }` | 认证成功 |
| `auth.error` | S→C | `{ code, message }` | 认证失败 |
| `auth.token` | C→S | `{ token }` | token 登录（启动时自动重连） |

#### 好友类

| type | 方向 | payload | 说明 |
|------|------|---------|------|
| `friend.search` | C→S | `{ query }` | 按 username/id 搜索用户 |
| `friend.search_result` | S→C | `{ users: [...] }` | 搜索结果 |
| `friend.add` | C→S | `{ userId }` | 发送好友申请 |
| `friend.add_notify` | S→C | `{ fromUser, displayName }` | 收到好友申请（推送） |
| `friend.accept` | C→S | `{ userId }` | 接受好友申请 |
| `friend.accept_notify` | S→C | `{ fromUser, displayName }` | 申请被接受（推送） |
| `friend.remove` | C→S | `{ userId }` | 删除好友 |
| `friend.list` | C→S | — | 请求好友列表 |
| `friend.list_result` | S→C | `{ friends: [...] }` | 好友列表 |

#### 消息类

| type | 方向 | payload | 说明 |
|------|------|---------|------|
| `msg.send` | C→S | `{ toUser, content, msgType? }` | 发送消息 |
| `msg.ack` | S→C | `{ requestId, messageId, createdAt }` | 发送回执（已入站） |
| `msg.new` | S→C | `{ fromUser, fromName, content, messageId, createdAt }` | 新消息推送 |
| `msg.delivered` | S→C | `{ messageId }` | 已送达确认 |
| `msg.read` | C→S | `{ messageId }` | 已读标记 |
| `msg.read_notify` | S→C | `{ messageId, fromUser }` | 对方已读通知 |

#### 在线状态

| type | 方向 | payload | 说明 |
|------|------|---------|------|
| `presence.online` | S→C | `{ userId }` | 好友上线（广播给所有好友） |
| `presence.offline` | S→C | `{ userId }` | 好友下线 |
| `presence.status` | C→S | `{ status }` | 设置状态（`online`/`away`/`busy`） |

#### 系统类

| type | 方向 | payload | 说明 |
|------|------|---------|------|
| `sys.offline_msgs` | S→C | `{ messages: [...] }` | 上线后推送离线消息 |
| `sys.error` | S→C | `{ code, message }` | 通用错误 |
| `ping` | C→S | — | 心跳（每 30s） |
| `pong` | S→C | — | 心跳回执 |

---

## 五、服务端实现方案

### 5.1 技术栈

```
运行时： Node.js 18+
WebSocket： ws (npm)
数据库： better-sqlite3
密码哈希： bcrypt (npm) 或 Node.js 内置 crypto.scryptSync
JWT： jsonwebtoken (npm)
```

### 5.2 文件结构

```
server/
  index.ts          # 入口：起 WS 服务、初始化 db
  db.ts             # SQLite 初始化、建表、迁移
  auth.ts           # 注册、登录、JWT 签发/校验
  friends.ts        # 好友搜索、添加、列表
  messages.ts       # 消息发送、转发、离线存储
  presence.ts       # 在线状态管理
  ws-handler.ts     # WS 消息路由（按 type 分发）
  types.ts          # 共享类型定义
```

### 5.3 关键逻辑

#### 消息流转

```
A 发送 →
  1. A → Server: { type: "msg.send", payload: { toUser: "B", content: "hi" } }
  2. Server: 写入 direct_messages，生成 messageId
  3. Server → A: { type: "msg.ack", payload: { requestId, messageId, createdAt } }
  4. Server: 查 online_users 看 B 是否在线
     ├── 在线 → Server → B: { type: "msg.new", payload: { ... } }
     │         标记 delivered_at
     └── 不在线 → 不做额外处理（B 上线时通过 sys.offline_msgs 推送）
```

#### 离线消息

B 上线后：
```
Server → B: { type: "sys.offline_msgs", payload: { messages: [...] } }
```
查询条件：`to_user = B AND delivered_at IS NULL ORDER BY created_at`

#### 好友上线广播

用户上线后：
- 查其所有已接受好友
- 对每个在线好友发送 `presence.online`

### 5.4 安全要点

- 密码：bcrypt salt 12 轮
- JWT：HS256，过期 30 天，包含 `userId`、`username`
- WS 连接鉴权：首个消息必须是 `auth.login` 或 `auth.token`，其他类型直接断连
- 消息发送验证：校验 `from_user` 与 token 中的 `userId` 一致
- 频率限制：单连接每秒最多 20 条消息

---

## 六、客户端改动

### 6.1 Main Process 新增

```
src/main/im/
  im-client.ts       # IM WebSocket 客户端（连接、重连、心跳、收发）
  im-store.ts        # IM 数据的本地读写（local_user, local_friends, local_dm）
  im-ipc.ts          # IPC handler：桥接 Renderer 和 IM 模块
```

### 6.2 Renderer 新增

```
src/renderer/
  pages/
    LoginPage.tsx     # 登录 / 注册页面
  components/
    FriendList.tsx    # 好友列表侧边栏
    FriendSearch.tsx  # 搜索用户弹窗
    FriendRequest.tsx # 好友请求通知
    ChatWindow.tsx    # IM 聊天窗口（复用现有 ChatMessage 组件逻辑）
  stores/
    imStore.ts        # Zustand store：当前用户、好友、消息列表
```

### 6.3 UI 布局变化

```
┌─────────────────────────────────────────────────┐
│  [IM] [Agent]                        [用户头像]  │  ← 顶部导航切换
├──────┬──────────────────────────────────────────┤
│好友  │                                          │
│列表  │         中间区域                          │
│      │     IM 聊天窗 / Agent 会话 / 代码面板     │
│      │                                          │
│ ──── │                                          │
│ 搜索  │                                          │
│ 好友  │                                          │
└──────┴──────────────────────────────────────────┘
```

### 6.4 启动流程

```
DeepSeek Code 启动
  → 读 local_user，有缓存 token → auth.token 尝试重连
    ├── 成功 → 进入主界面，IM 已连接
    └── 失败/过期 → 显示登录页
  → 无缓存 token → 显示登录页
```

---

## 七、开发顺序

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| 1 | **服务端搭架子**：WS 服务起机、DB 建表、心跳 | 小半天 |
| 2 | **认证**：注册/登录/JWT | 小半天 |
| 3 | **客户端 WS 接入**：连接、重连、心跳 | 小半天 |
| 4 | **登录页面**：Register/Login UI + 对接服务端 | 小半天 |
| 5 | **好友系统**：搜索、添加、列表（前后端） | 半天 |
| 6 | **消息收发**：发送、ack、推送、离线消息 | 半天 |
| 7 | **IM 聊天窗**：聊天 UI、消息列表、输入框 | 半天 |
| 8 | **在线状态**：presence 广播、状态指示 | 小半天 |

**总计预估：3-4 天**

---

## 八、Phase 2 预览（仅供参考）

Phase 2 在此架构基础上接入 Agent：

```
┌─────────────────────────────────────┐
│            IM Server                 │
│  ┌─────┐  ┌──────────┐  ┌────────┐ │
│  │ IM  │  │ Room     │  │ Agent  │ │
│  │ 1v1 │  │ Chat     │  │ Session│ │  ← 新增
│  └─────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────┘

Room Chat
  ├── 所有人的消息都发给 Agent
  ├── Agent 的回复广播给房间所有人
  ├── Agent 能区分每个发言者（userId 绑在消息上）
  └── Agent 工具调用结果选择性共享
```

---

## 九、附录

### A. 为什么用 WebSocket 而不是其他方案

| 方案 | 适合？ | 理由 |
|------|--------|------|
| WebSocket | ✅ | 双向推送、低延迟、长连接、生态成熟 |
| SSE | ❌ | 服务端→客户端单向，无法发消息 |
| HTTP 轮询 | ❌ | 延迟高、浪费带宽 |
| gRPC | ❌ | 重、与前端不太匹配 |
| Socket.IO | 可选 | 比 ws 重，但自带重连和房间。Phase 1 用 ws 够用 |

### B. 为什么服务端用 SQLite 而不是 PostgreSQL/MySQL

- 当前用户量级（十位数以内），SQLite 完全够用
- 零运维，单文件备份
- 与客户端同一技术栈，降低认知成本
- 日后需要时可迁移到 PostgreSQL

### C. JWT 方案

```
签发：
  jwt.sign({ userId, username }, SECRET, { expiresIn: '30d' })

校验：
  jwt.verify(token, SECRET)

SECRET 来源：
  环境变量 IM_JWT_SECRET || 启动时随机生成（重启后所有 token 失效）
  生产环境建议固定值，存 .env 或配置文件
```
