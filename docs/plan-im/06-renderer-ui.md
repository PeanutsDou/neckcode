# IM Phase 1 Renderer UI 设计

> 状态：草案，待审阅  
> 依赖：[05-client-main.md](./05-client-main.md)

## 1. 目标

Renderer UI 负责把 IM 能力做成可用界面，但不承担连接、鉴权、缓存的底层职责。

Phase 1 UI 目标：

- 登录 / 注册
- Agent / IM 模式切换
- 好友列表
- 好友申请
- 搜索和添加好友
- 一对一聊天窗口
- 消息发送状态
- 在线状态
- 基础错误提示和重连状态

## 2. UI 原则

- 不做营销页，IM 入口打开后就是工作界面。
- 保持现有 Neck Code 的桌面工具风格。
- 布局紧凑，优先效率和清晰状态。
- 不使用大面积装饰。
- 文字不遮挡、不溢出。
- IM 和 Agent 会话状态分离。

## 3. 页面结构

建议在现有 `App.tsx` 中增加模式：

```ts
type MainMode = 'agent' | 'im';
```

布局：

```text
┌──────────────────────────────────────────────┐
│ Neck Code      [IM] [Agent]     settings │
├───────────────┬──────────────────────────────┤
│ 好友/会话列表  │ 聊天窗口 / 登录页 / 空状态       │
│               │                              │
│ 搜索好友       │                              │
└───────────────┴──────────────────────────────┘
```

如果未登录，IM 模式下中间区域显示登录/注册页。

## 4. 文件结构

建议新增：

```text
src/renderer/stores/im-store.ts
src/renderer/components/im/
  ImShell.tsx
  LoginPage.tsx
  FriendList.tsx
  FriendSearchDialog.tsx
  FriendRequests.tsx
  DirectChat.tsx
  MessageComposer.tsx
  MessageList.tsx
  ConnectionBanner.tsx
```

如果项目偏好 `pages/`，`LoginPage.tsx` 可放 `src/renderer/pages/`。

## 5. Renderer 状态模型

`im-store.ts` 建议状态：

```ts
interface ImState {
  auth: ImAuthState;
  connection: ImConnectionState;
  currentUser: ImUser | null;
  friends: Record<string, ImFriend>;
  requests: ImFriendRequest[];
  conversations: Record<string, ImConversation>;
  messagesByPeer: Record<string, ImMessage[]>;
  activePeerId: string | null;
  searchResults: SearchUser[];
  loading: Record<string, boolean>;
  error: ImClientError | null;
}
```

状态规则：

- 登录态来自主进程 `imGetAuthState` 和 `onImAuthState`。
- 好友列表来自 `imListFriends` 和事件更新。
- 消息先读本地缓存，再接收实时事件。
- `activePeerId` 只存在 Renderer。
- token 不进 store。

## 6. 初始化流程

进入 IM 模式时：

```text
call imGetAuthState
  ├─ loggedOut -> 显示 LoginPage
  └─ loggedIn/online/reconnecting
       ├─ imListFriends
       ├─ imListConversations
       └─ 绑定 IM 事件监听
```

组件卸载时：

- 取消所有事件监听。
- 不主动 logout。
- 不关闭主进程 WebSocket。

## 7. 登录/注册页

### 7.1 字段

登录：

- username
- password

注册：

- username
- displayName
- password
- confirmPassword

### 7.2 校验

Renderer 先做基础校验：

| 字段 | 规则 |
| --- | --- |
| username | 3-32，字母数字下划线短横线 |
| displayName | 1-32 |
| password | 6-128 |
| confirmPassword | 必须一致 |

主进程和服务端仍需重复校验。

### 7.3 错误展示

| 错误码 | 展示 |
| --- | --- |
| `INVALID_CREDENTIALS` | 用户名或密码错误 |
| `USERNAME_EXISTS` | 用户名已存在 |
| `TOKEN_INVALID` | 登录已过期，请重新登录 |
| `SERVER_UNAVAILABLE` | 无法连接 IM 服务 |
| `REQUEST_TIMEOUT` | 请求超时，请重试 |

## 8. 模式切换

顶部增加 IM / Agent 切换。

规则：

- 切到 IM 不销毁 Agent 当前会话。
- 切回 Agent 不断开 IM WebSocket。
- 有未读消息时，IM 标签可以显示小圆点或计数。
- IM 未登录时，显示未登录状态但不影响 Agent。

## 9. 好友列表

好友列表包含：

- accepted 好友
- 在线状态
- 最后一条消息 preview
- 未读数
- 搜索入口
- 好友申请入口

排序建议：

1. 有未读消息的会话
2. 最近消息时间
3. 在线好友
4. 名称

空状态：

- 未添加好友时显示搜索好友入口。

错误点：

- 好友列表加载失败
- 本地缓存为空且服务端不可达
- 好友状态与消息会话不一致

处理：

- 本地有缓存时先显示缓存。
- 顶部连接条显示当前是离线缓存。

## 10. 好友搜索

搜索弹窗：

- 输入框
- 搜索结果列表
- 添加按钮
- relation 状态展示

状态：

| relation | 操作 |
| --- | --- |
| `self` | 不可操作 |
| `none` | 添加 |
| `pending_sent` | 已申请 |
| `pending_received` | 接受 |
| `accepted` | 发消息 |
| `blocked` | 不可操作 |

搜索建议 debounce 300ms，但实际请求由用户点击或输入停止后触发均可。

## 11. 好友申请

好友申请入口显示 pending 数。

申请列表：

- 申请人 displayName/username
- 接受按钮
- 可选忽略按钮，Phase 1 可不实现

接受成功：

- 申请移除或标记 accepted。
- 好友列表新增对方。
- 可直接打开聊天。

## 12. 聊天窗口

聊天窗口组成：

```text
顶部：好友名称 + 在线状态
中部：消息列表
底部：输入框 + 发送按钮
```

### 12.1 消息列表

消息字段：

- content
- direction
- createdAt
- status

状态展示：

| status | 展示 |
| --- | --- |
| `pending` | 发送中 |
| `sent` | 已发送 |
| `delivered` | 已送达，Phase 1 可不明显展示 |
| `read` | 已读，Phase 1 可后置 |
| `failed` | 发送失败，显示重试 |

### 12.2 发送输入

规则：

- 空消息不可发送。
- 超过 4000 字符禁止发送。
- Enter 发送，Shift+Enter 换行，需与现有 ChatInput 习惯确认。
- 发送中不禁用整个输入框，只禁用当前重复提交。

### 12.3 历史加载

打开聊天：

```text
先读本地 imListMessages
如果需要，调用 imLoadHistory 修复/补齐
滚动到最新
```

上拉加载：

- 先读本地更早消息。
- 本地不足时调用服务端 `msg.history`。

## 13. 连接状态 UI

建议在 IM 区域顶部显示轻量状态条。

状态：

| connection | 展示 |
| --- | --- |
| `online` | 不显示，或显示在线 |
| `connecting` | 正在连接 |
| `authenticating` | 正在登录 |
| `reconnecting` | 连接已断开，正在重连 |
| `offline` | 离线，显示本地缓存 |
| `error` | 显示错误和重试按钮 |

不要用弹窗频繁打断用户。连接错误用 banner 更合适。

## 14. 事件订阅

`ImShell` 负责统一订阅：

- auth state
- connection state
- friends updated
- friend request
- message new
- conversation updated
- presence
- error

要求：

- 每个订阅必须在 cleanup 中 unsubscribe。
- 避免每个子组件重复订阅全局事件。
- 高频消息事件更新 store 时注意按 peer 合并，避免整页重渲染。

## 15. 错误处理

Renderer 需要区分：

| 错误来源 | 展示 |
| --- | --- |
| 表单校验 | 字段下方 |
| 登录失败 | 登录表单顶部 |
| 连接断开 | IM 顶部 banner |
| 发送失败 | 消息气泡旁 |
| 好友操作失败 | 搜索/申请弹窗内 |
| 本地缓存失败 | banner 或 toast |

不建议：

- 所有错误都 alert。
- 连接失败时跳回登录页。
- 发送失败时删除用户输入。

## 16. 与现有 UI 的关系

可复用：

- CSS 变量
- 按钮样式
- 滚动条样式
- MessageBubble 的部分视觉规则

不建议复用：

- Agent `chat-store`
- Agent streaming 状态
- ToolCallCard
- ContextBar

原因：

- IM 消息没有工具调用和流式生成。
- Agent 会话和 IM 会话生命周期不同。

## 17. 验收点

Renderer UI 完成标准：

- 未登录进入 IM 显示登录/注册。
- 登录成功显示好友列表。
- 服务端不可达时显示连接错误，不影响 Agent。
- 可搜索用户并添加好友。
- 收到好友申请有可见提示。
- 接受好友后列表更新。
- 可打开好友聊天窗口。
- 在线消息实时出现。
- 离线消息上线后出现。
- 发送失败有失败状态和重试入口。
- 未读数在打开聊天后清零。

## 18. 待确认点

1. IM/Agent 切换放顶部 toolbar 左侧还是右侧。
2. IM 是否复用现有左侧 SessionList 的宽度和 resize 行为。
3. Enter 发送还是 Ctrl+Enter 发送。建议 Enter 发送，Shift+Enter 换行。
4. 是否第一版展示已读。建议服务端实现，UI 后置。
5. 未读数是否要写本地 DB。建议写入 `im_conversations`。

