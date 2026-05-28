# CC Core 功能补充计划

基于 `PLAN.md` 已规划但未实现、CCbase 源码中已验证的核心能力，补充 5 项功能。

---

## 进度总览

| # | 功能 | 状态 | 开始 | 完成 |
|---|------|------|------|------|
| 1 | WebFetch + WebSearch 工具 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 2 | 工具批次调度（只读并发 / 写串行） | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 3 | Task 系统 (Create/Get/List/Update) | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 4 | NotebookEdit 工具 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 5 | Skill 热加载系统 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 6 | 流式输出优化（IPC 缓冲 + 实时 Markdown） | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 7 | Session 标题 AI 自动命名 + 右键重命名 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 8 | AskUserQuestion 工具 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 9 | 工具可视化升级（图标/颜色/折叠卡片） | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 10 | 多 Provider 管理（动态增删） | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 11 | 暗色主题 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 12 | 图片输出渲染 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 13 | 文件拖拽输入（PDF/Office 解析） | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 14 | API Key AES 加密存储 | ✅ 已完成 | 2026-05-08 | 2026-05-08 |
| 15 | SQLite 替换 JSON 文件存储 | ⬜ 待开始 | — | — |
| 16 | 键盘快捷键自定义 | ⬜ 待开始 | — | — |
| 17 | 截图工具 | ⬜ 待开始 | — | — |
| 18 | Provider 协议重构 | ⬜ 待开始 | — | — |

---

## 1. WebFetch + WebSearch 工具

### 目标

补充 PLAN §5.3 已列出但未实现的两个网络工具。CCbase 中有独立实现，逻辑可参考。

### 实现方案

#### WebFetch

- **位置**: `src/main/tools/web-fetch.ts`
- **注册**: 在 `tools/registry.ts` 中添加 `web_fetch` 定义
- **核心逻辑**:
  - 接收 URL + prompt，GET 抓取页面 HTML
  - 用 Node.js 内置 `fetch`，无需额外依赖
  - 简单 HTML→text 转换（strip tags，保留结构）
  - 将提取文本 + prompt 作为结果返回（不做 AI 摘要，那是 Agent 的事）
  - 15 分钟内存缓存，避免重复请求同一 URL
  - 超时 15s，响应体上限 1MB
- **安全约束**:
  - 仅允许 http/https scheme
  - 禁止访问 localhost / 127.0.0.1 / [::1] / 内网段（10./172.16-31./192.168.）

#### WebSearch

- **位置**: `src/main/tools/web-search.ts`
- **注册**: 在 `tools/registry.ts` 中添加 `web_search` 定义
- **核心逻辑**:
  - 接收 query 字符串，调用公开搜索 API
  - 默认使用 DuckDuckGo Instant Answer API（无需 Key）
  - 可选配置 Google/Bing API Key
  - 返回标题 + URL + 摘要列表
  - 结果上限 10 条

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/main/tools/web-fetch.ts` | 新建 |
| `src/main/tools/web-search.ts` | 新建 |
| `src/main/tools/registry.ts` | 修改 — 添加 2 个 tool 定义和 handler |

### 验收标准

- [ ] 在对话中输入"搜索 XXX"能触发 web_search 工具调用
- [ ] Agent 能通过 web_fetch 抓取搜索结果中的 URL 内容
- [ ] localhost/内网 URL 被正确拦截
- [ ] 重复请求同一 URL 命中缓存

---

## 2. Task 系统

### 目标

补充 PLAN §5.3 列出的 task 工具。CCbase 有完整实现（`TaskCreateTool`, `TaskGetTool`, `TaskListTool`, `TaskUpdateTool`），搬运核心逻辑并适配 GUI。

### 实现方案

四个工具统一放在 `src/main/tools/task-tools.ts`：

#### TaskCreate

- `subject` (required): 任务标题
- `description` (required): 任务描述
- `activeForm` (optional): 进行时态描述，展示在 spinner
- 返回 task ID，状态初始为 `pending`

#### TaskGet

- `taskId` (required): 任务 ID
- 返回完整 task 信息：subject, description, status, blockedBy, blocks

#### TaskList

- 无参数
- 返回所有 task 摘要列表（id, subject, status, blockedBy）

#### TaskUpdate

- `taskId` (required)
- 可选更新: `status` (pending/in_progress/completed/deleted), `subject`, `description`, `addBlocks`, `addBlockedBy`
- 状态流转: pending → in_progress → completed（或 deleted 直接删除）

### 数据结构

```typescript
interface Task {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  blocks: string[];     // 被此任务阻塞的其他 task ID
  blockedBy: string[];  // 阻塞此任务的 task ID
  createdAt: number;
  completedAt?: number;
}
```

### 存储

- 会话级存储：tasks 数组挂在 session 对象上
- 与消息一起持久化到 session JSON 文件
- 渲染进程通过 IPC 同步 task 列表

### UI 联动（P1，本次可选）

- Task 列表面板（可选显示，与 SessionList 同级或独立 Tab）
- 对话中 Task 工具调用卡片特殊渲染
- 当前活跃 task 在 ContextBar 附近显示

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/main/tools/task-tools.ts` | 新建 — 4 个 task 工具 |
| `src/main/tools/registry.ts` | 修改 — 注册 4 个 tool 定义和 handler |
| `src/shared/types.ts` | 修改 — 添加 Task 类型 |
| `src/renderer/components/TaskPanel.tsx` | 新建（可选，P1） |

### 验收标准

- [ ] Agent 能创建 task → 更新状态 → 查询列表 → 获取详情
- [ ] 任务状态流转正确
- [ ] blockedBy 依赖关系正确阻止任务被 claim
- [ ] 任务数据随会话持久化

---

## 3. Skill 热加载系统

### 目标

替换 ChatInput 中 5 个硬编码 slash 命令，实现 PLAN §5.5 描述的"Skill 从本地目录热加载"。完全参照 CCbase `skills.js` 的 SKILL.md frontmatter 解析逻辑。

### 实现方案

#### Skill 加载器

- **位置**: `src/main/skills/loader.ts`
- 扫描目录（优先级从高到低）:
  1. `<workspace>/.claude/skills/`
  2. `<workspace>/skills/`
  3. `~/.claude/skills/`
- 读取每个子目录下的 `SKILL.md`，解析 YAML frontmatter：
  - `name` — skill 名称（必填）
  - `description` — 描述
  - `when_to_use` — 触发条件描述（给 Agent 判断用）
  - `allowed-tools` — 允许的工具列表
  - `argument-hint` — 参数提示
  - `model` — 指定模型（可选）
  - `disable-model-invocation` — 禁止模型调用（用户手动触发）
  - `user-invocable` — 用户可通过 `/` 触发
- 结果缓存在内存，`claude-md:reload` 时刷新

#### Skill 工具

- **位置**: `src/main/tools/skill-tools.ts`
- 注册 2 个工具:
  - `list_skills` — 列出所有已加载 skill（name + description + whenToUse）
  - `invoke_skill` — 加载指定 skill 的 SKILL.md 内容到上下文

#### Slash 命令面板

- 改造 `ChatInput.tsx` 中的 slash 命令：
  - 保留 `/clear` `/model` 等内置命令
  - 动态追加从 skill loader 加载的 user-invocable skills
  - `/skill-name` → 调用 invoke_skill

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/main/skills/loader.ts` | 新建 — SKILL.md 扫描 + frontmatter 解析 |
| `src/main/skills/types.ts` | 新建 — Skill 类型定义 |
| `src/main/tools/skill-tools.ts` | 新建 — list_skills + invoke_skill |
| `src/main/tools/registry.ts` | 修改 — 注册 skill 工具 |
| `src/main/ipc-handlers.ts` | 修改 — 暴露 skill 列表给渲染进程 |
| `src/main/preload.ts` | 修改 — 添加 skill IPC 方法 |
| `src/renderer/components/ChatInput.tsx` | 修改 — 动态 slash 命令 |
| `src/shared/types.ts` | 修改 — 添加 Skill 相关类型 |

### 验收标准

- [ ] `~/.claude/skills/` 下的 SKILL.md 被正确加载
- [ ] Agent 能看到 `list_skills` 结果并调用 `invoke_skill`
- [ ] ChatInput `/` 面板显示用户可触发的 skill
- [ ] 新建/修改 SKILL.md 后刷新生效

---

## 4. NotebookEdit 工具

### 目标

补充 PLAN §5.3 列出的 `notebook_edit` 工具。支持 Jupyter Notebook (.ipynb) 的单元格级编辑。

### 实现方案

- **位置**: `src/main/tools/notebook-edit.ts`
- 不引入额外依赖，`.ipynb` 本质是 JSON
- 提供 3 种操作模式（通过 `edit_mode` 参数）:
  - `replace` — 替换指定 cell 的 source（默认）
  - `insert` — 在指定 cell 后插入新 cell
  - `delete` — 删除指定 cell
- 参数:
  - `notebook_path` (required): 相对路径
  - `new_source` (required): 新 cell 内容
  - `cell_id` (optional): 目标 cell ID，不指定则操作第一个 cell
  - `cell_type` (optional): `code` / `markdown`，默认保持原类型
  - `edit_mode` (optional): `replace` / `insert` / `delete`

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/main/tools/notebook-edit.ts` | 新建 |
| `src/main/tools/registry.ts` | 修改 — 注册 notebook_edit |

### 验收标准

- [ ] 能读取 .ipynb 文件并替换指定 cell 内容
- [ ] 支持 insert / delete 模式
- [ ] 路径逃逸检查生效
- [ ] 非法 JSON 文件返回明确错误

---

## 5. 工具批次调度

### 目标

实现 CCbase `QueryEngine.partitionToolCalls` 的核心逻辑：同一轮中多个 tool call，只读工具并发执行，写工具串行执行。这是纯运行时优化，不影响 UI 层。

### 实现方案

- **位置**: 改造 `src/main/agent/runtime.ts` 中的工具执行循环
- **核心逻辑**（参照 CCbase `queryEngine.js:147-162`）:
  1. 遍历本轮 toolCalls
  2. 相邻的只读工具（`readOnly: true`）归入同一个并发批次
  3. 写工具（`readOnly: false` 或未声明）每个单独一个串行批次
  4. 批次内 `Promise.all`，批次间 `await`
- 工具定义需要新增 `readOnly` 字段：
  - `read_file`, `list_dir`, `glob`, `grep` → `readOnly: true`
  - `write_file`, `edit_file`, `delete_file`, `run_shell` → `readOnly: false`
  - `web_fetch`, `web_search` → `readOnly: true`
  - Task 工具 → `readOnly: false`
  - Skill 工具 → `readOnly: true` (list/invoke 不产生副作用)

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/main/tools/registry.ts` | 修改 — ToolDefinition 加 `readOnly` 字段 |
| `src/main/agent/runtime.ts` | 修改 — runUserTurn 中的工具执行改为批次调度 |
| `src/main/agent/types.ts` | 修改 — ToolDefinition 加 `readOnly?: boolean` |
| `src/shared/types.ts` | 修改 — 同步 ToolDefinition |

### 验收标准

- [ ] 同一轮中 read_file + glob + grep 三个调用并发执行
- [ ] write_file 和 read_file 在同一轮时，write 先串行，其余 read 并发
- [ ] 并发执行结果顺序正确（tool result 按 tool call 顺序返回给模型）

---

## 实施顺序

```
1. WebFetch + WebSearch  ← 最简单，独立文件，先热手
2. 工具批次调度           ← 改运行时核心，影响后续所有工具行为
3. Task 系统             ← 4 个互相关联的工具，依赖批次调度
4. NotebookEdit          ← 独立工具，快速完成
5. Skill 热加载          ← 涉及文件最多，前后端都有改动
```

---

## 备注

- 所有新增工具统一走 `tools/registry.ts` 注册，保持与现有 8 个工具一致的接口
- UI 联动（Task 面板、Skill 设置面板等）不在本期范围，工具本身通即可
- 每完成一项，更新顶部进度表并 commit

---

## 6. AskUserQuestion 工具

### 目标

Agent 执行过程中遇到不确定事项时，可以向用户提问并获得反馈。CCbase 有 `AskUserQuestionTool`，搬运核心逻辑。

### 实现方案

- **位置**: `src/main/tools/ask-user-question.ts`
- 注册为 `ask_user_question` 工具，`readOnly: true`
- 参数：
  - `questions` (required): 问题数组，每项包含 `question`、`header`、`options`
  - `answers` 由 GUI 弹窗收集（通过 IPC 发送到渲染进程 → 显示模态框 → 用户选择 → 返回）
- 流程：
  1. Agent 调用 `ask_user_question` → 工具执行
  2. Main process 通过 IPC 发送问题到渲染进程
  3. 渲染进程弹出选项对话框
  4. 用户选择后，结果通过 IPC 返回给 main process
  5. 工具返回 JSON 格式的问答结果给 Agent

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/main/tools/ask-user-question.ts` | 新建 |
| `src/main/tools/registry.ts` | 修改 |
| `src/main/ipc-handlers.ts` | 修改 — IPC 往返 |
| `src/renderer/components/AskDialog.tsx` | 新建 — 问题弹窗 UI |

### 验收标准

- [ ] Agent 能通过该工具向用户提问
- [ ] 用户能选择选项并返回给 Agent
- [ ] 超时处理（用户不回答时工具不永久阻塞）

---

## 7. 多 Provider 管理

### 是什么

当前 neckcode 的 Provider 是硬编码的——`main/index.ts` 通过 `model.startsWith('claude-')` 判断走哪个 Provider，设置面板也只有 DeepSeek 和 Anthropic 两个固定 Tab。

**多 Provider 管理**的意思是：用户可以自由添加、编辑、删除任意 OpenAI 兼容接口的模型供应商，无需改代码。

### 能支持什么

实现后，用户可以在设置面板里：

- **添加 Ollama** — 本地运行 `http://localhost:11434/v1`，用本地模型（qwen2.5-coder、llama3 等），数据不出本机
- **添加硅基流动（SiliconFlow）** — `https://api.siliconflow.cn/v1`，国产便宜模型聚合平台
- **添加通义千问（Qwen）** — 阿里云 DashScope API
- **添加 vLLM / OpenRouter / Groq / Together** — 任何 OpenAI 兼容接口
- **每个 Provider 配置独立**：baseUrl、API Key、模型列表
- **会话内跨 Provider 热切换** — 比如先用 DeepSeek 写代码，切到 Qwen-VL 看图，再切到本地 Ollama 做敏感数据处理

### 实现方案

- **Provider 配置存储**：在 `config.json` 中改为 `providers: ProviderConfig[]` 数组
- **Provider 注册中心**：`src/main/providers/registry.ts`，维护活跃 Provider 实例
- **设置面板**：列表式管理（而非固定 Tab），支持增删改
- **ModelSwitcher**：改为两级选择（Provider → Model），而非当前单级

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/main/providers/registry.ts` | 新建 — Provider 注册中心 |
| `src/main/config.ts` | 修改 — 支持多 Provider 配置 |
| `src/main/index.ts` | 修改 — 使用 registry 替代 if/else |
| `src/main/ipc-handlers.ts` | 修改 — 增删改 Provider IPC |
| `src/renderer/components/SettingsDialog.tsx` | 重写 — Provider 列表管理 UI |
| `src/renderer/components/ModelSwitcher.tsx` | 修改 — 两级选择 |

### 验收标准

- [ ] 添加新 Provider → API Key 保存 → 模型列表可用
- [ ] 会话中切换 Provider 和 Model 不中断上下文
- [ ] 删除 Provider 不影响已有会话历史

---

## 8. 暗色主题

### 目标

在现有亮色 CSS 变量基础上，加一份暗色主题 + 切换开关。

### 实现方案

- 新增 `src/renderer/styles/dark.css`，覆盖 `:root` 变量
- 在 `App.tsx` 工具栏加主题切换按钮（太阳/月亮图标）
- 用户选择持久化到 config

### 验收标准

- [ ] 亮/暗切换即时生效
- [ ] 所有组件在暗色下可读

---

## 9. 工具可视化升级

### 目标

不同工具调用显示不同图标和颜色，结果以可折叠卡片展示（非裸文本）。

### 工具 → 视觉映射

| 工具 | 图标 | 颜色 |
|------|------|------|
| read_file | 📄 | 蓝 |
| write_file / edit_file | ✏️ | 绿 |
| delete_file | 🗑 | 红 |
| run_shell | >_ | 灰 |
| glob / grep | 🔍 | 紫 |
| web_fetch / web_search | 🌐 | 青 |
| task_* | ✅ | 橙 |
| notebook_edit | 📓 | 粉 |
| list_skills / invoke_skill | ⚡ | 金 |

### 实现方案

- `ToolCallCard` 组件：可折叠 header（图标 + 工具名 + 参数摘要）+ 展开显示结果
- 修改 `MessageBubble` 中 tool 消息的渲染，使用 ToolCallCard

### 验收标准

- [ ] 每种工具调用有不同视觉呈现
- [ ] 卡片可折叠/展开
- [ ] 大量工具调用时不卡顿

---

## 10. Provider 协议重构

### 目标

将工具从函数 map 升级为 CCbase 式的统一对象协议 `{ name, description, inputSchema, handler(input, context) }`，为后续插件/MCP 打基础。

### 改动

- 所有工具文件导出标准 Tool 对象
- `registry.ts` 从对象数组注册
- 工具执行时传入 `ToolContext`（workspaceRoot, sessionId, runtime ref）

### 验收标准

- [ ] 所有 18 个工具使用统一协议
- [ ] 新增工具只需实现接口并注册
- [ ] 不影响现有功能

---

## 其余待办简述

| # | 功能 | 要点 |
|---|------|------|
| 12 | 图片输出渲染 | Markdown 中的 `![img](url)` 和 base64 图片在消息气泡中内联显示 |
| 13 | 文件拖拽输入 | 拖拽 PDF/Word 到输入框 → 解析文本注入上下文 |
| 14 | API Key 加密 | AES-256-GCM 加密落盘，启动时解密到内存，不记录到日志 |
| 15 | SQLite 存储 | `better-sqlite3` 替换 JSON 文件，支持高效查询和迁移 |
| 16 | 快捷键自定义 | 设置面板管理快捷键，支持录制和冲突检测 |
| 17 | 截图工具 | 框选屏幕区域 → 自动粘贴到输入框作为图片附件 |
