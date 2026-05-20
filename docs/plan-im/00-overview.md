# IM Phase 1 总览

> 状态：草案，待审阅  
> 依据：../PLAN-IM.md  
> 实际开发以本目录文档为准

## 1. 目标

在 DeepSeek Code 中新增一套独立的一对一即时通讯能力，为后续多人共享 Agent 协作空间做基础设施准备。

Phase 1 的目标是完成最小可用 IM 闭环：

- 用户注册、登录、token 自动登录
- 好友搜索、添加、接受、列表
- 一对一文字消息
- 在线实时推送
- 离线消息上线补发
- Electron 客户端本地缓存和基础 UI

## 2. 非目标

Phase 1 明确不做：

- 群聊、房间、频道
- 多人共享 Agent
- 文件、图片、语音、视频
- 多端同步
- 消息撤回、编辑、引用、转发
- 端到端加密
- 服务端集群、Redis、PostgreSQL
- 管理后台
- 复杂用户资料系统

以上能力进入后续阶段时，需要重新补充协议和数据模型，不在 Phase 1 中以半成品方式混入。

## 3. 总体原则

### 3.1 最小侵入

现有 Agent 会话、代码面板、会话持久化、工具调用逻辑不应被 IM 模块改写。

IM 作为并行模块接入：

- 服务端独立运行。
- Electron 主进程新增 IM client。
- Renderer 新增 IM 页面和状态管理。
- 现有 ChatPanel 继续服务 Agent。

### 3.2 服务端保持轻量

IM Server 只负责：

- 认证
- 好友关系
- 在线状态
- 消息持久化
- WebSocket 推送

不负责：

- Agent 推理
- UI 状态
- 客户端本地缓存
- 多端冲突合并

### 3.3 协议先行

所有开发必须以 [02-protocol.md](./02-protocol.md) 为接口合同。

不得出现：

- 服务端临时加字段但不更新协议
- 客户端依赖未文档化字段
- Renderer 直接猜测 WebSocket 消息结构
- 同一概念多套字段名，例如 `to_user` 和 `toUser` 混用

### 3.4 错误显式

可预期失败必须有错误码。

典型失败包括：

- 未登录
- token 过期
- 用户不存在
- 好友关系不存在
- 非好友发消息
- 消息为空
- 消息过长
- 连接断开
- 本地缓存写入失败

## 4. 文档结构

```text
docs/plan-im/
  00-overview.md              # 当前文件：目标、范围、原则、阶段拆分
  01-architecture.md          # 总体架构与模块边界
  02-protocol.md              # WebSocket JSON 协议
  03-database.md              # 服务端和客户端本地数据库设计
  04-server.md                # 独立 IM Server 设计
  05-client-main.md           # Electron 主进程 IM client/store/ipc
  06-renderer-ui.md           # Renderer 状态管理和 UI 设计
  07-test-plan.md             # 测试、验收、回归矩阵
  08-implementation-roadmap.md # 分阶段落地顺序
```

## 5. Phase 1 交付定义

Phase 1 完成时，应满足：

1. 可以启动独立 IM Server。
2. 两个 DeepSeek Code 客户端可以分别登录不同账号。
3. A 可以搜索 B，发送好友申请。
4. B 在线时能收到好友申请。
5. B 接受后，双方好友列表都显示对方。
6. A 给在线 B 发文字消息，A 收到 ack，B 收到新消息。
7. B 离线时，A 发消息仍能入库。
8. B 重新上线后收到离线消息。
9. 客户端重启后能通过 token 自动登录。
10. 本地能保留好友列表和聊天消息缓存。
11. 服务端和客户端对常见错误有可见反馈。

## 6. 阶段拆分

### Stage 0：文档与协议冻结

产出：

- 协议文档
- 服务端设计
- 数据库设计
- 客户端主进程设计
- Renderer UI 设计
- 测试计划

完成标准：

- 字段名、消息类型、错误码、表结构不再随意变更。
- 待审阅决策点全部确认或标记为后置。

### Stage 1：服务端最小可运行

产出：

- WebSocket 服务
- SQLite 初始化
- ping/pong
- 统一错误响应

完成标准：

- ws 客户端能连上并收到 `pong`。
- 非法 JSON、未知类型、未登录请求有明确错误。

### Stage 2：认证闭环

产出：

- 注册
- 登录
- token 登录
- 密码 hash
- JWT
- 单用户单连接

完成标准：

- 客户端可注册并拿到 token。
- 重启连接后可用 token 恢复登录。

### Stage 3：好友闭环

产出：

- 搜索用户
- 添加好友
- 好友申请通知
- 接受好友
- 好友列表
- 在线状态补充

完成标准：

- A/B 可建立 accepted 好友关系。
- 好友列表能反映在线状态。

### Stage 4：消息闭环

产出：

- 发送消息
- 服务端入库
- ack
- 在线推送
- 离线消息
- 历史消息

完成标准：

- 在线、离线两类消息都能正确到达或恢复。

### Stage 5：Electron 主进程接入

产出：

- `im-client.ts`
- `im-store.ts`
- `im-ipc.ts`
- preload API
- 本地缓存表

完成标准：

- Renderer 不直接连 WS，也能完成登录、好友、消息操作。

### Stage 6：Renderer UI

产出：

- 登录/注册页
- Agent/IM 模式切换
- 好友列表
- 好友搜索/申请
- 一对一聊天窗口
- 未读/在线/发送状态基础展示

完成标准：

- 用户可以在 UI 中完成 Phase 1 交付定义中的全部路径。

### Stage 7：稳定性与验收

产出：

- 手工测试矩阵通过
- 核心服务端单元测试
- 客户端主进程连接测试
- 打包运行验证

完成标准：

- 无未处理异常。
- 断线、重连、服务端重启、token 失效都有明确表现。

## 7. 关键决策

默认决策：

- 服务端独立运行，不嵌入 Electron。
- 服务端使用 SQLite。
- 好友关系使用双向两行。
- Phase 1 单用户单连接。
- Renderer 不直接连接 WebSocket。
- 服务端推送离线消息后即标记 delivered，并用 history 做修复能力。

需要审阅确认：

- 密码 hash 选 `crypto.scryptSync` 还是 `bcrypt`。
- 服务端源码放 `server/` 还是 `src/server/`。
- IM Server 是否由 Electron 自动拉起，还是用户/部署脚本单独启动。
- `msg.read` 和 `friend.remove` 是否进入第一批实现。

