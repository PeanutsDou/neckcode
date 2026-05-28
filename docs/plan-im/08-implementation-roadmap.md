# IM Phase 1 实施路线

> 状态：草案，待审阅  
> 目标：把文档转化为可执行开发顺序

## 1. 总原则

开发顺序必须遵守：

```text
协议冻结 -> 服务端 -> 主进程 -> Renderer -> 稳定性
```

不要跳过服务端和主进程直接做 UI。IM 的核心风险在连接、认证、状态一致性和离线恢复，UI 应该建立在稳定事件流上。

## 2. Stage 0：文档确认

输入：

- `00-overview.md`
- `01-architecture.md`
- `02-protocol.md`
- `03-database.md`
- `04-server.md`
- `05-client-main.md`
- `06-renderer-ui.md`
- `07-test-plan.md`

需要确认：

1. 协议消息类型是否接受。
2. 错误码是否接受。
3. 好友关系双向两行是否接受。
4. 单用户单连接是否接受。
5. 离线消息 delivered 简化是否接受。
6. 服务端代码位置。
7. IM Server 启动方式。

退出标准：

- 决策点有明确结论。
- 不再频繁改字段名和表结构。

## 3. Stage 1：服务端骨架

开发内容：

- 新增 server 目录
- TypeScript 构建方式
- `config.ts`
- `db.ts`
- `index.ts`
- `ws-handler.ts`
- `errors.ts`
- `ping/pong`

验收：

- 服务启动成功。
- SQLite 文件创建成功。
- ws 客户端 ping 返回 pong。
- 非 JSON 返回 `BAD_JSON`。
- 未登录业务请求返回 `UNAUTHORIZED`。

风险：

- 当前项目 tsconfig 只包含 `src/main` 和 `src/shared`。如果服务端放根目录 `server/`，需要单独 tsconfig 或运行方式。

收束建议：

- 服务端放 `server/`，配 `server/tsconfig.json`，避免影响 Electron 构建。

## 4. Stage 2：服务端认证

开发内容：

- users 表
- 密码 hash
- JWT 签发/验证
- `auth.register`
- `auth.login`
- `auth.token`
- 连接上下文绑定
- 单用户单连接

验收：

- 注册、登录、token 登录完整。
- 重复用户名、错误密码、无效 token 都返回明确错误。
- 已认证连接不能重复认证。

风险：

- JWT secret 开发环境变化导致 token 失效。
- 密码 hash 方案影响依赖安装。

收束建议：

- 第一版用 Node `crypto.scryptSync`，减少依赖。
- `IM_JWT_SECRET` 没有时开发环境随机生成并打印警告。

## 5. Stage 3：服务端好友

开发内容：

- friends 表
- `friend.search`
- `friend.add`
- `friend.accept`
- `friend.list`
- 可选 `friend.remove`
- 好友申请在线推送

验收：

- A/B 可建立好友。
- B 在线时收到申请。
- 好友列表包含 accepted 和 pending requests。
- 搜索结果 relation 正确。

风险：

- 同时互相添加好友。
- 重复申请。
- 删除和接受并发。

收束建议：

- 所有关系变更用事务。
- A 已收到 B 申请时，A add B 等价 accept。

## 6. Stage 4：服务端消息

开发内容：

- direct_messages 表
- `msg.send`
- `msg.ack`
- `msg.new`
- `sys.offline_msgs`
- `msg.history`
- 可选 `msg.read`

验收：

- 非好友不能发消息。
- 在线好友实时收到。
- 离线好友上线收到离线消息。
- history 能恢复消息。

风险：

- 推送失败但 delivered_at 已更新。
- 客户端重复收到消息。
- 消息顺序。

收束建议：

- `ws.send` 成功后才更新 delivered_at。
- 客户端用 messageId 幂等。
- 查询和返回按 createdAt ASC。

## 7. Stage 5：主进程 IM client

开发内容：

- `src/main/im/im-client.ts`
- 请求 pending map
- connect/auth/reconnect/heartbeat
- 服务端事件分发
- 错误归一化

验收：

- 主进程能登录 IM Server。
- token 登录成功。
- 服务端断开后自动重连。
- pending 请求超时可控。

风险：

- 重连循环过快。
- logout 后仍重连。
- pending 请求泄漏。

收束建议：

- 明确 `manualLogout` 标志。
- 所有 pending 请求都有 timeout。
- close 时统一 reject pending。

## 8. Stage 6：主进程本地缓存与 IPC

开发内容：

- `im-store.ts`
- IM 本地表初始化
- local user
- friends
- requests
- messages
- conversations
- `im-ipc.ts`
- preload API

验收：

- 登录态可持久化。
- 好友和消息可本地读取。
- Renderer 可通过 IPC 调用所有 IM 功能。
- 服务端 push 可转成 Renderer 事件。

风险：

- 复用 `neckcode.db` 时锁冲突。
- token 暴露给 Renderer。
- IPC 参数未校验。

收束建议：

- 主进程统一 DB 访问。
- `imGetAuthState` 不返回 token。
- 所有 IPC handler 做参数校验。

## 9. Stage 7：Renderer 登录与 Shell

开发内容：

- `im-store.ts`
- `ImShell`
- `LoginPage`
- IM/Agent 模式切换
- 连接状态 banner

验收：

- 未登录显示登录页。
- 登录成功进入 IM 主界面。
- 连接断开显示重连。
- Agent 模式不受影响。

风险：

- IM 初始化阻塞 App 启动。
- 切换模式丢 Agent 状态。

收束建议：

- IM 只在进入 IM 模式时初始化 UI 数据。
- 主进程可后台连接，但 UI 不依赖其成功。

## 10. Stage 8：Renderer 好友

开发内容：

- FriendList
- FriendSearchDialog
- FriendRequests
- 好友在线状态
- 未读入口预留

验收：

- 搜索、添加、接受全流程 UI 可用。
- 好友申请实时出现。
- 好友在线/离线状态更新。

风险：

- pending 状态和 accepted 状态重复展示。
- 申请通知丢失。

收束建议：

- `friend.list_result` 是最终修复来源。
- request 和 friends 在 store 中分开管理。

## 11. Stage 9：Renderer 聊天

开发内容：

- DirectChat
- MessageList
- MessageComposer
- 本地历史加载
- 发送 pending/sent/failed 状态
- 收消息和未读数

验收：

- 在线聊天实时。
- 离线消息展示。
- failed 可重试。
- 打开聊天未读清零。

风险：

- messageId/localId 映射错误。
- 重复消息。
- 滚动位置混乱。

收束建议：

- 本地消息模型明确保留 local_id。
- messageId 幂等。
- 第一版只做基本滚动到底，不做复杂虚拟列表也可以。

## 12. Stage 10：稳定性与打包

开发内容：

- 完整手工测试矩阵
- 服务端启动脚本
- 开发环境说明
- 错误日志检查
- 打包验证

验收：

- IM Server 不可达时 App 可正常用 Agent。
- 打包后不会因为缺少 server 文件导致启动失败。
- 端到端矩阵通过。

风险：

- 服务端是否随客户端分发未定。
- native 依赖打包。

收束建议：

- Phase 1 先按独立部署处理。
- Electron 打包不强行包含 IM Server，后续再做一键启动。

## 13. 推荐第一批实现范围

第一批必须做：

- `auth.register/login/token`
- `friend.search/add/accept/list`
- `msg.send/ack/new/offline_msgs/history`
- `presence.online/offline`
- 主进程 token 自动登录、重连、心跳
- 本地 user/friends/messages/conversations 缓存
- 登录页、好友列表、聊天窗口

第一批建议后置：

- `friend.remove`
- `msg.read`
- `presence.status`
- 已读 UI
- 头像上传
- 多端同步

## 14. 每阶段交付物

| 阶段 | 交付物 |
| --- | --- |
| Stage 1 | 可启动 IM Server |
| Stage 2 | 可注册/登录/token 登录 |
| Stage 3 | 可建立好友 |
| Stage 4 | ws 脚本可在线/离线收发消息 |
| Stage 5 | Electron 主进程可连接服务端 |
| Stage 6 | Renderer 可通过 IPC 调用 IM |
| Stage 7 | UI 可登录 |
| Stage 8 | UI 可加好友 |
| Stage 9 | UI 可聊天 |
| Stage 10 | 测试矩阵通过 |

## 15. 开发前最终检查

真正写代码前检查：

- 文档决策点已确认。
- 当前 git 工作区变更明确。
- 新增依赖已确认。
- 服务端运行方式已确认。
- 本地 DB 迁移方案已确认。
- 测试账号和测试脚本方案已确认。

