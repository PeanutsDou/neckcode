# IM Phase 1 数据库设计

> 状态：草案，待审阅  
> 范围：服务端 SQLite + 客户端本地 SQLite 缓存

## 1. 目标

数据库设计需要同时满足：

- 服务端作为权威数据源。
- 客户端可在重启后恢复登录态、好友列表和聊天历史。
- 离线消息可恢复。
- 好友关系、消息权限、已读状态有明确来源。
- 表结构简单，便于 Phase 1 快速落地。

## 2. 数据库划分

Phase 1 有两类数据库：

| 数据库 | 位置 | 职责 |
| --- | --- | --- |
| 服务端 DB | IM Server 配置路径 | 用户、好友关系、消息权威存储 |
| 客户端 DB | `~/.deepseekcode/deepseekcode.db` | 登录态、好友、消息本地缓存 |

规则：

- 服务端 DB 是权威来源。
- 客户端 DB 是缓存，不用于服务端权限判断。
- 客户端缓存可被清空，清空后应能重新登录并拉取基础状态。

## 3. 服务端数据库

### 3.1 users

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

约束：

- `username` 唯一。
- `password_hash` 必须是 hash，不允许保存明文。
- `display_name` 可修改，但 Phase 1 可以不提供修改接口。

### 3.2 friends

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

关系写法：

| 场景 | A -> B | B -> A |
| --- | --- | --- |
| A 申请 B | `pending_sent` | `pending_received` |
| B 接受 A | `accepted` | `accepted` |
| 删除好友 | 删除 | 删除 |

所有双向写入必须使用事务。

### 3.3 direct_messages

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

状态含义：

| 字段 | 含义 |
| --- | --- |
| `created_at` | 服务端入库时间 |
| `delivered_at` | 服务端已向接收方连接推送或离线补发 |
| `read_at` | 接收方标记已读 |

## 4. 客户端本地数据库

客户端复用现有 `~/.deepseekcode/deepseekcode.db`。现有 `sessions` 表不改动，只新增 IM 表。

### 4.1 im_local_user

```sql
CREATE TABLE IF NOT EXISTS im_local_user (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT,
  token TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  server_url TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

约束：

- Phase 1 单账号登录，可以只保留一行。
- 切换账号时清理旧账号内存状态，但本地消息缓存可按 `owner_user_id` 保留。
- token 不存 Renderer，不存 localStorage。

### 4.2 im_friends

```sql
CREATE TABLE IF NOT EXISTS im_friends (
  owner_user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT,
  status TEXT NOT NULL,
  online INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_im_friends_owner_status ON im_friends(owner_user_id, status);
```

说明：

- `owner_user_id` 是当前本地账号。
- `status` 来自服务端 `friend.list_result`。
- `online` 是缓存状态，启动时默认可置 0，登录后由服务端刷新。

### 4.3 im_friend_requests

```sql
CREATE TABLE IF NOT EXISTS im_friend_requests (
  owner_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, user_id, direction),
  CHECK (direction IN ('in', 'out')),
  CHECK (status IN ('pending', 'accepted', 'removed'))
);

CREATE INDEX IF NOT EXISTS idx_im_friend_requests_owner ON im_friend_requests(owner_user_id, status);
```

说明：

- 入站申请来自 `friend.add_notify` 或 `friend.list_result.requests`。
- 出站申请来自 `friend.add_ack` 或搜索结果 relation。

### 4.4 im_direct_messages

```sql
CREATE TABLE IF NOT EXISTS im_direct_messages (
  owner_user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  peer_user_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  direction TEXT NOT NULL,
  content TEXT NOT NULL,
  msg_type TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  read_at INTEGER,
  local_created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, message_id),
  CHECK (direction IN ('in', 'out')),
  CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_im_dm_peer_created ON im_direct_messages(owner_user_id, peer_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_im_dm_owner_status ON im_direct_messages(owner_user_id, status);
```

发送前的本地 pending 消息没有服务端 `message_id` 时，需要一个本地 ID。

推荐做法：

- Renderer 发起发送时生成 `localMessageId`。
- 主进程先写入 pending，`message_id` 暂用 `local:<uuid>`。
- 收到 `msg.ack` 后，用服务端 `messageId` 替换或插入新记录并删除 local 记录。

为降低替换主键复杂度，也可以增加 `local_id`：

```sql
local_id TEXT
```

建议实际实现采用 `local_id`，`message_id` 收到 ack 后再填入，并把唯一约束调整为：

```sql
UNIQUE(owner_user_id, message_id)
```

审阅时需要确认最终方案。

### 4.5 im_conversations

```sql
CREATE TABLE IF NOT EXISTS im_conversations (
  owner_user_id TEXT NOT NULL,
  peer_user_id TEXT NOT NULL,
  last_message_id TEXT,
  last_message_preview TEXT,
  last_message_at INTEGER,
  unread_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, peer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_im_conversations_updated ON im_conversations(owner_user_id, updated_at DESC);
```

用途：

- 快速渲染会话列表。
- 维护未读数。
- 避免每次打开 IM 都扫描全部消息表。

## 5. 客户端缓存写入规则

### 5.1 登录成功

收到 `auth.ok`：

```text
upsert im_local_user
清空内存错误状态
触发 friend.list
```

### 5.2 好友列表

收到 `friend.list_result`：

```text
事务：
  upsert im_friends
  upsert im_friend_requests
  可将不在结果中的 pending_received 标记 removed
```

不要删除本地消息。

### 5.3 新消息

收到 `msg.new` 或 `sys.offline_msgs`：

```text
事务：
  insert or ignore im_direct_messages
  upsert im_conversations
  如果当前聊天窗口不是该 peer，unread_count + 1
```

重复消息必须幂等。

### 5.4 发送 ack

收到 `msg.ack`：

```text
找到 requestId 对应 local message
更新 message_id/status/created_at
更新 conversation
```

如果找不到 local message：

- 插入一条 out 消息。
- 记录 warn 日志。

### 5.5 发送失败

收到 `sys.error` 或请求超时：

```text
找到 requestId 对应 local message
更新 status = failed
保存错误信息到内存状态，必要时也可扩展 error_code 字段
```

## 6. 迁移策略

服务端：

- `CREATE TABLE IF NOT EXISTS`
- 启动时检查 `PRAGMA table_info`
- 缺字段时 `ALTER TABLE`
- 复杂迁移再引入 `schema_migrations`

客户端：

- 复用现有 `session-store.ts` 中的 DB 连接思路。
- IM 表初始化放在 `src/main/im/im-store.ts`。
- 初始化必须幂等。

建议新增：

```sql
CREATE TABLE IF NOT EXISTS im_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

Phase 1 如果迁移很少，可以先不用，但文档预留。

## 7. 数据一致性风险

| 风险 | 处理 |
| --- | --- |
| 服务端推送成功但客户端本地写入失败 | 客户端通过 `msg.history` 修复 |
| 好友申请通知丢失 | `friend.list` 返回 pending requests 修复 |
| 客户端 pending 消息 ack 丢失 | 发送超时标 failed，用户重试 |
| 本地缓存和服务端好友状态不一致 | 登录后以 `friend.list_result` 覆盖 |
| 重复离线消息 | 客户端 insert ignore，服务端 delivered_at 控制 |
| 同时添加好友 | 服务端事务和唯一键处理 |

## 8. 待确认点

1. 客户端 pending 消息是否增加 `local_id`，建议增加。
2. 客户端是否保留多账号缓存，建议按 `owner_user_id` 保留。
3. token 是否需要加密存储。当前项目已有 secrets 能力，后续可复用；Phase 1 至少不要暴露到 Renderer。
4. 是否引入 `schema_migrations`。建议服务端和客户端都预留。

