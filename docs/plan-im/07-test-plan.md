# IM Phase 1 测试与验收计划

> 状态：草案，待审阅  
> 范围：服务端、Electron 主进程、Renderer UI、端到端手工验收

## 1. 目标

测试计划用于保证 IM Phase 1 的核心路径稳定，不因网络、权限、缓存、重连等问题产生隐性数据错误。

重点验证：

- 协议消息正确
- 认证可靠
- 好友关系一致
- 在线消息实时
- 离线消息可恢复
- 本地缓存幂等
- 断线重连可控
- 错误路径有明确反馈

## 2. 测试分层

| 层级 | 目标 | 工具建议 |
| --- | --- | --- |
| 服务端单元测试 | auth/friends/messages 业务逻辑 | Node test runner 或 vitest |
| 服务端集成测试 | WebSocket 协议和 DB | ws client + 临时 SQLite |
| 主进程测试 | im-client/im-store/im-ipc | mock ws server |
| Renderer 测试 | store reducer 和 UI 状态 | React Testing Library，可后置 |
| 端到端手工 | 两客户端真实流程 | 两个 Electron 实例或 ws 脚本 |

Phase 1 可以先保证服务端集成测试和手工矩阵，Renderer 自动化可后续补。

## 3. 服务端测试

### 3.1 启动与协议

| 用例 | 输入 | 预期 |
| --- | --- | --- |
| 启动服务 | 默认配置 | 监听 7654，DB 自动创建 |
| ping | `{ type: "ping" }` | 返回 `pong` |
| 非 JSON | `abc` | 返回 `BAD_JSON` |
| 空 object | `{}` | 返回 `BAD_REQUEST` |
| 未知 type | `unknown.test` | 返回 `UNKNOWN_TYPE` |
| 未登录业务请求 | `friend.list` | 返回 `UNAUTHORIZED` |

### 3.2 认证

| 用例 | 预期 |
| --- | --- |
| 注册新用户 | `auth.ok`，返回 user/token |
| 重复注册 username | `USERNAME_EXISTS` |
| username 格式错误 | `BAD_REQUEST` |
| password 太短 | `BAD_REQUEST` |
| 正确密码登录 | `auth.ok` |
| 错误密码登录 | `INVALID_CREDENTIALS` |
| 不存在用户登录 | `INVALID_CREDENTIALS` |
| token 登录 | `auth.ok` |
| 篡改 token | `TOKEN_INVALID` |
| 过期 token | `TOKEN_INVALID` |
| 已认证连接再次认证 | `BAD_REQUEST` |

### 3.3 好友

| 用例 | 预期 |
| --- | --- |
| 搜索存在用户 | 返回用户对象，无敏感字段 |
| 搜索自己 | relation 为 `self` |
| 添加自己 | `CANNOT_ADD_SELF` |
| 添加不存在用户 | `USER_NOT_FOUND` |
| 添加用户 | A pending_sent，B pending_received |
| 重复添加 | `FRIEND_REQUEST_EXISTS` 或保持幂等，需实现前确认 |
| B 在线收到申请 | B 收到 `friend.add_notify` |
| B 接受申请 | 双方 accepted |
| 非申请接收方 accept | `FRIEND_REQUEST_NOT_FOUND` |
| 删除好友 | 双方关系删除 |
| 删除不存在好友 | 成功，保持幂等 |

### 3.4 消息

| 用例 | 预期 |
| --- | --- |
| 非好友发消息 | `NOT_FRIEND` |
| 发送空消息 | `MESSAGE_EMPTY` |
| 发送超长消息 | `MESSAGE_TOO_LONG` |
| 发送给不存在用户 | `USER_NOT_FOUND` |
| 好友在线发消息 | 发送方 `msg.ack`，接收方 `msg.new` |
| 在线推送失败 | 不更新 delivered_at |
| 好友离线发消息 | 发送方 `msg.ack`，delivered_at 为 null |
| 离线用户上线 | 收到 `sys.offline_msgs` |
| 离线消息不重复 | 第二次登录不重复推送 |
| 标记已读 | `msg.read_ack`，发送方收到 `msg.read_notify` |
| 非接收方标记已读 | `UNAUTHORIZED` |
| 拉历史 | 返回双方消息，按 createdAt 升序 |

### 3.5 在线状态

| 用例 | 预期 |
| --- | --- |
| 好友上线 | 在线好友收到 `presence.online` |
| 好友下线 | 在线好友收到 `presence.offline` |
| 同用户重复登录 | 新连接保留，旧连接关闭 |
| 旧连接 close | 不误广播 offline |
| 心跳超时 | 连接关闭并触发下线 |

## 4. 主进程测试

### 4.1 im-client

| 用例 | 预期 |
| --- | --- |
| connect 成功 | state 变 connecting/authenticating/online |
| 服务端不可达 | `SERVER_UNAVAILABLE`，进入 reconnecting/offline |
| auth.ok | 保存 currentUser |
| auth.error | reject pending request |
| sys.error 带 requestId | reject 对应请求 |
| 请求超时 | reject `REQUEST_TIMEOUT` |
| 连接断开 | pending 请求全部 reject |
| 重连成功 | 自动 auth.token + friend.list |
| 手动 logout | 停止重连，清理 token |

### 4.2 im-store

| 用例 | 预期 |
| --- | --- |
| 初始化 | IM 表自动创建 |
| 重复初始化 | 不报错 |
| 保存 local user | 可读回 |
| 清理 local user | token 消失 |
| upsert friends | 幂等 |
| 插入重复 messageId | 不重复 |
| pending -> sent | status 和 messageId 更新 |
| failed message | status failed |
| conversation unread | 未读数正确 |
| 打开 conversation | 未读清零 |

### 4.3 im-ipc

| 用例 | 预期 |
| --- | --- |
| Renderer 参数非法 | 主进程返回 `BAD_REQUEST` |
| 未登录发送消息 | 返回 `UNAUTHORIZED` 或客户端侧错误 |
| imSendMessage | 写 pending，发送 WS |
| 服务端 ack | Renderer 收到状态更新 |
| 服务端 push | Renderer 收到事件 |
| unsubscribe | 不再收到事件 |

## 5. Renderer 测试

可先手工，后续自动化。

| 用例 | 预期 |
| --- | --- |
| 未登录进入 IM | 显示登录页 |
| 登录中 | 按钮 loading，避免重复提交 |
| 登录失败 | 表单显示错误 |
| 登录成功 | 显示好友列表 |
| 连接断开 | 顶部 banner 显示重连 |
| 搜索好友 | 显示结果和 relation |
| 收到申请 | 申请入口计数增加 |
| 接受申请 | 好友列表更新 |
| 打开聊天 | 加载本地消息 |
| 发送消息 | 出现 pending 气泡 |
| ack | pending 变 sent |
| 发送失败 | 气泡 failed，可重试 |
| 收到新消息 | 消息列表更新，未读数变化 |
| 打开有未读聊天 | 未读清零 |

## 6. 端到端手工矩阵

需要至少两个账号：

```text
alice
bob
```

### 6.1 基础路径

1. 启动 IM Server。
2. 客户端 A 注册 alice。
3. 客户端 B 注册 bob。
4. A 搜索 bob。
5. A 添加 bob。
6. B 收到申请。
7. B 接受。
8. A/B 好友列表均显示 accepted。
9. A 给 B 发消息。
10. B 实时收到。
11. B 回复 A。
12. A 实时收到。

### 6.2 离线路径

1. B 退出或断开 IM。
2. A 给 B 连续发 3 条消息。
3. A 都收到 ack。
4. B 重新上线。
5. B 收到 3 条离线消息，顺序正确。
6. B 再次重连，不重复收到这 3 条。

### 6.3 重连路径

1. A/B 在线。
2. 关闭 IM Server。
3. 客户端显示重连中。
4. 期间发送消息应 failed 或 pending 超时。
5. 重启 IM Server。
6. 客户端自动恢复登录。
7. 好友列表恢复。
8. 新消息可正常发送。

### 6.4 token 失效

1. A 登录成功。
2. 修改服务端 JWT secret 或构造无效 token。
3. A 重启客户端。
4. token 登录失败。
5. UI 回到登录状态，不死循环重连。

### 6.5 本地缓存

1. A/B 聊天产生历史。
2. 关闭客户端 A。
3. 重开客户端 A。
4. 登录恢复后能看到本地历史。
5. 调用 history 后不重复显示消息。

## 7. 回归风险清单

每次改 IM 相关代码后至少检查：

- Agent 会话仍可发送消息。
- 文件树和代码面板仍可打开。
- 应用启动不依赖 IM Server。
- IM Server 不可达时主窗口仍可用。
- 关闭窗口到托盘逻辑不受影响。
- SQLite sessions 表不受 IM 表迁移影响。

## 8. 验收标准

Phase 1 可验收条件：

- 端到端手工矩阵通过。
- 服务端无未捕获异常。
- 主进程无未处理 promise rejection。
- Renderer 无白屏。
- 断线重连、token 失效、服务端不可达都有明确 UI。
- 本地缓存重复写入不产生重复消息。
- 协议文档中的第一批消息全部实现。

