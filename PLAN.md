# DeepSeek Code — 技术规划

## 一、架构总览

```
┌──────────────────────────────────────────────────────────┐
│                     Electron App                          │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │   Main Process        │  │  Renderer Process         │ │
│  │   (Node.js)           │  │  (React 18 + TS)          │ │
│  │                       │  │                           │ │
│  │  ┌─────────────────┐ │  │  ┌─────────────────────┐  │ │
│  │  │ IPC Handlers    │◄┼──┼──┤ Zustand Stores      │  │ │
│  │  └────────┬────────┘ │  │  └──────────┬──────────┘  │ │
│  │           │           │  │             │              │ │
│  │  ┌────────▼────────┐ │  │  ┌──────────▼──────────┐  │ │
│  │  │ Agent Runtime   │ │  │  │ UI Components       │  │ │
│  │  │ (ReAct Loop)    │ │  │  │ - ChatPanel         │  │ │
│  │  └────────┬────────┘ │  │  │ - MonacoEditor      │  │ │
│  │           │           │  │  │ - FileTree          │  │ │
│  │  ┌────────▼────────┐ │  │  │ - TerminalPanel     │  │ │
│  │  │ Provider Layer   │ │  │  │ - SettingsDialog    │  │ │
│  │  │ - OpenAI Compat  │ │  │  │ - ModelSwitcher     │  │ │
│  │  │ - Anthropic SDK  │ │  │  └────────────────────┘  │ │
│  │  └────────┬────────┘ │  │                           │ │
│  │           │           │  │                           │ │
│  │  ┌────────▼────────┐ │  │                           │ │
│  │  │ Tool Registry   │ │  │                           │ │
│  │  │ - File tools    │ │  │                           │ │
│  │  │ - Shell tools   │ │  │                           │ │
│  │  │ - Web tools     │ │  │                           │ │
│  │  └────────┬────────┘ │  │                           │ │
│  │           │           │  │                           │ │
│  │  ┌────────▼────────┐ │  │                           │ │
│  │  │ SQLite DB        │ │  │                           │ │
│  │  │ - sessions       │ │  │                           │ │
│  │  │ - messages       │ │  │                           │ │
│  │  │ - configs        │ │  │                           │ │
│  │  └─────────────────┘ │  │                           │ │
│  └──────────────────────┘  └──────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**关键设计决策**：Agent 运行时跑在 Main Process，通过 Electron IPC 与 Renderer 通信。不需要 HTTP/WebSocket 中间层——Electron 原生 IPC 就是 Node.js ↔ Chromium 的高效通道。

---

## 二、技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 桌面壳 | Electron 28+ | React + Monaco + Node.js 同进程，IPC 零开销 |
| 前端框架 | React 18 + TypeScript | 可复用 CC/src 中大量 React 组件 |
| 状态管理 | Zustand | 轻量，适合中等复杂度桌面应用 |
| 代码编辑器 | Monaco Editor (@monaco-editor/react) | VS Code 内核，功能成熟 |
| 终端模拟 | xterm.js | 内嵌终端标准方案 |
| Markdown | react-markdown + rehype-highlight + remark-math | Markdown + 代码高亮 + LaTeX |
| Diff 渲染 | diff (jsdiff) + 自绘组件 | 轻量，去掉 react-diff-viewer 的依赖 |
| 虚拟滚动 | @tanstack/react-virtual | 长对话性能 |
| 数据库 | better-sqlite3 | 同步 API，Electron 主进程最佳选择 |
| 加密 | Node.js crypto (AES-256-GCM) | 内置，零依赖，API Key 加密 |
| 构建 | Vite (Renderer) + tsc (Main) | 快，Electron 生态主流 |
| 打包 | electron-builder | Windows NSIS 安装包 |

---

## 三、数据流

### 3.1 一次完整的用户对话轮次

```
用户在 ChatInput 输入文字（可附带图片/文件）
    │
    ▼
ChatInput ──► chatStore.sendMessage(text, attachments)
    │
    ▼
IPC invoke: 'agent:send-message' { sessionId, content, attachments[] }
    │
    ▼
Main: ipc-handlers.ts
    │
    ├─► SessionManager.load(sessionId)          // 加载会话历史
    ├─► ContextBuilder.build(messages, files)    // 构造上下文
    │
    ▼
AgentRuntime.runUserTurn(userMessage, {
    onTextDelta(text) {
        mainWindow.webContents.send('agent:delta', { text })  // → UI 流式渲染
    },
    onToolStart(toolCall) {
        mainWindow.webContents.send('agent:tool-start', toolCall)  // → UI 显示工具卡片
    },
    onToolResult(result) {
        mainWindow.webContents.send('agent:tool-result', result)   // → UI 更新结果
    },
    onComplete(turn) {
        mainWindow.webContents.send('agent:turn-done', turn)       // → UI 标记完成
    },
    onError(error) {
        mainWindow.webContents.send('agent:error', error)          // → UI 显示错误
    }
})
    │
    ▼
SessionManager.save(sessionId, newMessages)     // 持久化到 SQLite
```

### 3.2 模型热切换

```
用户在 ModelSwitcher 选择新模型
    │
    ▼
IPC invoke: 'provider:switch' { providerId, modelId }
    │
    ▼
Main: ProviderManager.setActive(providerId, modelId)
    │
    ▼
下次 runUserTurn 自动使用新 Provider 实例
会话历史不变，仅新消息走新模型
```

### 3.3 多会话并行

```
Session A (project-A, deepseek-chat)
Session B (project-B, claude-sonnet-4-6)
Session C (project-A, qwen-max, compare mode)

每个会话独立存储：
  - 独立 messages 数组
  - 独立 AgentRuntime 实例（轻量，共享 ToolRegistry）
  - 独立 Provider 配置引用

前端同一时间仅展示一个活跃会话
切换会话 = 切换 messages 数组 + 恢复上下文
```

---

## 四、目录结构

```
deepseekcode/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
├── vite.config.ts
│
├── src/
│   ├── main/                        # Electron Main Process
│   │   ├── index.ts                 # 入口：窗口创建、托盘、生命周期
│   │   ├── ipc-handlers.ts          # 所有 IPC channel handlers
│   │   │
│   │   ├── agent/
│   │   │   ├── runtime.ts           # Agent 主循环 (ReAct)
│   │   │   ├── session.ts           # ChatSession：消息历史管理
│   │   │   └── context.ts           # 上下文构建 + token 估算 + compaction
│   │   │
│   │   ├── providers/
│   │   │   ├── types.ts             # Provider 接口定义
│   │   │   ├── registry.ts          # Provider 注册中心
│   │   │   ├── openai-compatible.ts # DeepSeek / Qwen / Ollama / SiliconFlow
│   │   │   └── anthropic.ts         # Claude (Anthropic SDK)
│   │   │
│   │   ├── tools/
│   │   │   ├── types.ts             # Tool 接口定义
│   │   │   ├── registry.ts          # 工具注册中心 + 权限检查
│   │   │   ├── file-read.ts         # Read
│   │   │   ├── file-write.ts        # Write
│   │   │   ├── file-edit.ts         # Edit (精确字符串替换)
│   │   │   ├── file-glob.ts         # Glob
│   │   │   ├── file-grep.ts         # Grep
│   │   │   ├── shell.ts             # Bash / PowerShell
│   │   │   ├── web-fetch.ts         # WebFetch
│   │   │   └── web-search.ts        # WebSearch
│   │   │
│   │   ├── db/
│   │   │   ├── index.ts             # SQLite 初始化 + 迁移
│   │   │   ├── sessions.ts          # 会话 CRUD
│   │   │   ├── messages.ts          # 消息 CRUD
│   │   │   └── configs.ts           # 配置读写
│   │   │
│   │   └── config/
│   │       ├── store.ts             # 配置管理
│   │       └── secrets.ts           # API Key 加解密
│   │
│   ├── renderer/                    # React UI
│   │   ├── index.html
│   │   ├── main.tsx                 # React 入口
│   │   ├── App.tsx                  # 根组件：布局路由
│   │   │
│   │   ├── stores/                  # Zustand stores
│   │   │   ├── chat-store.ts        # 当前会话消息 + 流式状态
│   │   │   ├── session-store.ts     # 会话列表 + 切换
│   │   │   ├── editor-store.ts      # 编辑器 tabs + 文件树
│   │   │   └── config-store.ts      # 配置 + Provider 列表
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx     # 顶层三栏布局
│   │   │   │   ├── Sidebar.tsx      # 左侧会话列表
│   │   │   │   ├── Toolbar.tsx      # 顶部工具栏（模型切换等）
│   │   │   │   └── StatusBar.tsx    # 底部状态栏（token 用量等）
│   │   │   │
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx    # 对话面板容器
│   │   │   │   ├── MessageList.tsx  # 虚拟滚动消息列表
│   │   │   │   ├── MessageBubble.tsx # 单条消息气泡
│   │   │   │   ├── ChatInput.tsx    # 输入框 + 附件
│   │   │   │   ├── ToolCallCard.tsx # 工具调用卡片
│   │   │   │   └── DiffPreview.tsx  # 内联 diff 组件
│   │   │   │
│   │   │   ├── editor/
│   │   │   │   ├── EditorPanel.tsx  # 编辑区容器
│   │   │   │   ├── MonacoEditor.tsx # Monaco 封装
│   │   │   │   ├── FileTree.tsx     # 文件树
│   │   │   │   └── EditorTabs.tsx   # 文件 Tab 栏
│   │   │   │
│   │   │   ├── terminal/
│   │   │   │   └── TerminalPanel.tsx # xterm.js 终端
│   │   │   │
│   │   │   ├── settings/
│   │   │   │   ├── SettingsDialog.tsx # 设置窗口
│   │   │   │   ├── ProviderConfig.tsx # Provider 配置页
│   │   │   │   └── KeybindingsConfig.tsx # 快捷键配置
│   │   │   │
│   │   │   └── common/
│   │   │       ├── Markdown.tsx     # Markdown 渲染
│   │   │       ├── CodeBlock.tsx    # 代码块（高亮+复制）
│   │   │       └── ContextBar.tsx   # 上下文用量进度条
│   │   │
│   │   ├── hooks/
│   │   │   ├── useIpc.ts            # IPC 通信 hook
│   │   │   └── useStreaming.ts      # 流式文本接收 hook
│   │   │
│   │   └── styles/
│   │       ├── global.css           # 全局样式 + CSS 变量
│   │       └── themes/
│   │           ├── dark.css
│   │           └── light.css
│   │
│   └── shared/                      # 主进程/渲染进程共享
│       ├── types.ts                 # Message, Session, ToolCall, Provider...
│       └── ipc-channels.ts          # IPC channel 名称常量
│
├── resources/                       # 图标、安装程序资源
│   └── icon.png
│
└── skills/                          # 内置 Skill 定义
    └── example-skill/
        └── SKILL.md
```

---

## 五、核心模块设计

### 5.1 Agent 运行时

复用 `CC/app/agent/runtime.js` 的设计，TypeScript 重写，增强点：

```
AgentRuntime:
  runUserTurn(userMessage, callbacks) → Promise<TurnResult>
    │
    ├─► addUserMessage(message)
    │
    └─► loop (maxTurns):
          ├─► Provider.runStep(messages, tools, onDelta)
          │     └─► LLM API (streaming)
          │
          ├─► addAssistantStep(step)
          │
          ├─► if no toolCalls → return step (done)
          │
          └─► for each toolCall:
                ├─► ToolRegistry.execute(toolCall)
                └─► addToolResult(toolCall, result)
```

**增强点 vs CC 版本**：
- 支持 `onDelta` 回调携带 `tool_call` 信息（流式中的工具调用增量）
- 支持 `abortController` 中断
- 每轮后自动触发 `SessionManager.save()`
- Token 计数（用于上下文管理）

### 5.2 Provider 层

```typescript
// src/main/providers/types.ts

interface Provider {
  readonly id: string;
  readonly name: string;          // 显示名
  readonly type: 'openai-compatible' | 'anthropic';

  runStep(params: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;                // 会话级模型，可随时变更
    onDelta: (delta: TextDelta | ToolCallDelta) => void;
    signal: AbortSignal;
  }): Promise<AssistantStep>;
}
```

两个实现：
- **OpenAICompatibleProvider**：适配 DeepSeek / Qwen / Ollama / SiliconFlow，纯 HTTP fetch + SSE 解析
- **AnthropicProvider**：通过 `@anthropic-ai/sdk` 官方 SDK，原生支持 prompt caching、vision、extended thinking

切换模型 = 改 `model` 参数，不重建 Provider 实例。

### 5.3 工具注册

```typescript
// src/main/tools/types.ts

interface Tool {
  definition: ToolDefinition;     // OpenAI function calling 格式
  execute(args: unknown, context: ToolContext): Promise<string>;
  requiresConfirmation?: (args: unknown) => boolean;  // 是否需要确认
}

interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
}
```

内置工具（CC 核心集）：
- `read_file` / `write_file` / `edit_file` — 文件 I/O
- `glob` / `grep` — 搜索
- `run_shell` — 命令执行（含确认）
- `web_fetch` / `web_search` — 网络
- `task` — 任务管理
- `notebook_edit` — Jupyter Notebook

后续可扩展：`skill`、`agent`（子 Agent）、`mcp_*` 等。

### 5.4 数据库设计

```sql
-- 会话
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,          -- UUID
    project_path TEXT NOT NULL,
    title TEXT,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    system_prompt TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

-- 消息
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,         -- 消息序号（排序用）
    role TEXT NOT NULL,           -- user / assistant / tool / system
    content TEXT,                 -- 文本内容
    metadata TEXT,                -- JSON: attachments, toolcalls, diff...
    token_count INTEGER,
    created_at INTEGER
);

-- 配置
CREATE TABLE configs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL           -- JSON
);
```

### 5.5 Electron IPC 通道设计

```typescript
// src/shared/ipc-channels.ts

// Agent → UI
'agent:delta'            → { text: string }
'agent:tool-start'       → { id, name, argumentsText }
'agent:tool-result'      → { id, result }
'agent:turn-done'        → { step: AssistantStep }
'agent:error'            → { message: string }

// UI → Agent
'agent:send-message'     → { sessionId, content, attachments[] }
'agent:abort'            → void

// Session
'session:list'           → Session[]
'session:create'         → { projectPath } → Session
'session:delete'         → { sessionId }
'session:switch'         → { sessionId } → Message[]
'session:export'         → { sessionId, format } → string

// Provider/Config
'config:get'             → AppConfig
'config:set'             → { key, value }
'provider:list'          → ProviderConfig[]
'provider:add'           → ProviderConfig
'provider:update'        → ProviderConfig
'provider:delete'        → { id }

// File system
'fs:read-file'           → { path } → string
'fs:write-file'          → { path, content }
'fs:list-dir'            → { path } → FileEntry[]
'fs:create-dir'          → { path }
'fs:delete'              → { path }

// Shell
'shell:exec'             → { command, cwd } → { stdout, stderr, exitCode }
```

---

## 六、开发阶段

### Phase 1: MVP（P0 功能，预计 2-3 周）

**目标**：能对话、能写代码、能切换模型

| 任务 | 内容 |
|------|------|
| 1.1 项目脚手架 | Electron + React + Vite + TypeScript 工程搭建 |
| 1.2 窗口管理 | 主窗口、布局、托盘、尺寸记忆 |
| 1.3 Agent 运行时 | 移植 `CC/app/agent/runtime.js` → TypeScript |
| 1.4 Provider 层 | OpenAI 兼容 Provider（DeepSeek 首发） |
| 1.5 对话面板 | ChatInput + MessageBubble + Markdown 渲染 + 流式 |
| 1.6 工具集 | read/write/edit/glob/grep/shell |
| 1.7 代码编辑 | Monaco Editor + FileTree + EditorTabs |
| 1.8 会话持久化 | SQLite 建表 + 消息存取 |
| 1.9 配置系统 | 设置面板：Provider 配置 + System Prompt + 界面设置 |
| 1.10 模型切换 | ModelSwitcher 下拉 + Provider 热切换 |

**交付物**：可安装的 Windows 桌面应用，完成"对话 → AI 操作文件 → 查看结果"闭环。

### Phase 2: 体验增强（P1 功能，预计 2 周）

**目标**：接近 Claude Code CLI 的完整能力 + 更好的可视化

| 任务 | 内容 |
|------|------|
| 2.1 Anthropic Provider | Claude 模型支持（官方 SDK） |
| 2.2 多 Provider 管理 | Settings 中管理多个 Provider |
| 2.3 多会话 | 侧边栏会话列表，新建/切换/删除 |
| 2.4 工具可视化 | ToolCallCard 折叠卡片，不同工具不同样式 |
| 2.5 Slash 命令 | `/` 触发命令面板 |
| 2.6 Diff 预览 | AI 修改文件的内联 diff 展示 + Apply/Reject |
| 2.7 上下文管理 | Token 用量进度条 + compaction |
| 2.8 编辑器联动 | 选中发对话 + AI diff 一键写入 |
| 2.9 内嵌终端 | xterm.js 集成 |
| 2.10 确认机制 | 危险操作弹出确认框 |

### Phase 3: 多模态（P1-P2 功能，预计 2 周）

**目标**：图片/文件实体输入输出，不再受限于文本

| 任务 | 内容 |
|------|------|
| 3.1 图片输入 | 粘贴/拖拽/上传图片，base64 注入 API |
| 3.2 图片输出 | AI 返回图片内联渲染 |
| 3.3 Vision 模型 | Qwen-VL / Claude Vision / DeepSeek Vision |
| 3.4 文件输入 | 拖拽文件读取内容注入上下文 |
| 3.5 截图工具 | 框选屏幕区域直接发对话 |
| 3.6 语音输入 | 录音 → 语音识别 → 填入输入框 |

### Phase 4: 打磨（P2-P3，预计 1-2 周）

| 任务 | 内容 |
|------|------|
| 4.1 模型对比 | 并排对比模式 |
| 4.2 Mermaid 渲染 | 代码块自动转换图表 |
| 4.3 主题系统 | 亮/暗 + 自定义 CSS 变量 |
| 4.4 快捷键 | 可自定义全局快捷键 |
| 4.5 启动优化 | 冷启动 < 3s |
| 4.6 TTS | 语音播报 AI 回复 |

---

## 七、关键技术风险

| 风险 | 应对 |
|------|------|
| Monaco Editor 在 Electron 下性能 | 已验证 VS Code 基础方案，风险低。大文件延迟加载 |
| better-sqlite3 跨平台编译 | 仅 Windows 先行，后续 CI 处理多平台 |
| Vision API 格式差异 | Provider 接口统一处理多模态 content parts |
| 流式解析中断处理 | AbortController + 自动重试机制 |
| Electron 打包体积 | 不打包完整 Node，用 electron-builder 的 asar 优化 |

---

## 八、源码复用清单

从 `D:\douzhongjun\about\learn-dou\CC\` 直接复用或参考：

| 源文件 | 用途 | 方式 |
|--------|------|------|
| `app/agent/runtime.js` | Agent 主循环 | TypeScript 重写，逻辑不变 |
| `app/lib/session.js` | ChatSession 消息管理 | TypeScript 重写 + SQLite 持久化 |
| `app/providers/openaiCompatible.js` | OpenAI 兼容 Provider | TypeScript 重写，增加 Anthropic Vision content parts |
| `app/tools/index.js` | 文件/Shell 工具 | TypeScript 重写 + 增加 Edit/Glob/Grep |
| `app/lib/config.js` | 配置加载 | 参考结构，增强为 GUI 配置 |
| `src/` 目录（TSX 源码） | React 组件/工具/命令参考 | 参考组件结构、工具定义、命令模式 |
