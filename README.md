# DeepSeek Code

桌面 GUI 编程助手，支持多模型切换。基于 Electron + React + TypeScript 构建。

一个自包含的桌面应用，把 AI 编程 Agent 和代码编辑器放在同一个窗口里——不需要浏览器，不需要终端，不需要 VS Code 插件。

## 核心概念

### Agent 运行时

DeepSeek Code 在 Electron 主进程中运行自己的 ReAct（推理+行动）Agent 循环。Agent 自主规划、调用工具、读写文件、执行 Shell 命令、迭代直到任务完成——所有过程实时流式显示在界面上。

### 多供应商 & 多模型

支持任意兼容 OpenAI 协议的供应商（DeepSeek、硅基流动、Ollama、OpenAI 等）以及 Anthropic 模型。每个模型可独立配置上下文窗口大小和最大输出 Token 数。对话中途热切换模型，不丢失聊天历史。

### 技能系统

可插拔的技能模块（SKILL.md 文件），扩展 Agent 的能力。技能可以存放在：
- **内置** —— 随应用发布
- **项目级** —— `<工作区>/.deepseekcode/skills/`
- **用户全局** —— `~/.deepseekcode/skills/`

技能定义触发条件，Agent 在任务匹配时主动调用。

### 记忆 & AGENT.md

- **AGENT.md** —— 全局（`~/.deepseekcode/AGENT.md`）或项目级指令文件，自动注入到每次对话的 System Prompt 中
- **记忆系统** —— 持久化的键值记忆文件，存放在 `~/.deepseekcode/memory/`，Agent 可以读写

### 工作区

Agent 操作限定在可配置的工作区目录内（通过代码面板设置）。所有文件操作默认沙盒在这个目录下。工作区与应用程序自身的数据目录完全独立。

## 功能

### 对话界面
- Markdown 流式渲染，代码语法高亮
- Mermaid 图表支持
- 文件修改内联 Diff 预览
- 工具调用卡片（点击展开详情）
- 重新生成回复 / 编辑后重发
- 运行中发送补充消息（自动中断当前任务后继续）

### 代码面板
- 全屏切换，替代聊天视图
- 树形文件浏览器，展开/收起目录
- Monaco 编辑器（VS Code 同款内核），20+ 语言语法高亮
- 多标签页编辑，Ctrl+S 保存，右键"发送选中内容到聊天"
- 工作区目录选择器，支持系统原生文件夹浏览

### 多会话
- 多个独立对话并行
- 会话列表，自动生成标题
- SQLite 持久化存储
- 切换模型上下文不丢失

### 主题系统
- 6 套浅色配色：默认、晴蓝、竹青、青禾、暖砂、淡紫
- 夜蓝深色模式
- 高对比度区域分区
- Ctrl+滚轮缩放字体

### 终端
- 集成 xterm.js 终端
- 在工作区根目录运行

### 上下文管理
- 中日韩字符感知的 Token 估算
- 80% 阈值自动上下文压缩
- 每个模型独立配置上下文窗口

## 安装

### 前置条件

- **Node.js** 18+
- **npm** 9+
- **Windows 10/11**（主要目标平台；macOS/Linux 可能需要调整）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/PeanutsDou/deepseekcode.git
cd deepseekcode

# 安装依赖
npm install
```

### 开发模式

```bash
# 同时启动 Vite 开发服务器和 Electron
npm run dev
```

这会启动：
- Vite 开发服务器（端口 5175，Renderer 热重载）
- TypeScript 编译器（Main 进程）
- Electron 窗口（从 Vite 加载）

### 生产构建

```bash
# 构建渲染进程
npm run build:renderer

# 构建主进程
npm run build:main

# 打包（待实现）
```

## 配置

所有用户数据存储在 `~/.deepseekcode/` 下：

```
~/.deepseekcode/
├── config.json          # 供应商、模型、偏好设置
├── deepseekcode.db     # 会话数据（SQLite）
├── .key                 # API Key 加密密钥
├── AGENT.md             # 用户全局指令
├── memory/              # 记忆文件
└── skills/              # 用户安装的技能
```

### 添加模型供应商

1. 工具栏点击"设置"
2. 点击"＋ 添加供应商"
3. 填写名称、Base URL、API Key
4. 用"＋"按钮添加模型，每个模型独立设置上下文窗口和最大输出

常见 Base URL：
- DeepSeek: `https://api.deepseek.com/v1`
- 硅基流动: `https://api.siliconflow.cn/v1`
- Ollama: `http://localhost:11434/v1`
- OpenAI: `https://api.openai.com/v1`

### 设置工作区

代码面板顶部的工作区输入框直接编辑，或点击"..."用系统文件夹选择器浏览。

## 项目结构

```
deepseekcode/
├── config/                     # 构建配置
│   ├── tsconfig.json
│   ├── tsconfig.main.json
│   ├── tsconfig.renderer.json
│   └── vite.config.ts
├── docs/                       # 设计文档
│   ├── REQUIREMENTS.md
│   ├── PLAN.md
│   └── PLAN-CC-CORE.md
├── resources/                  # 应用图标
├── skills/                     # 内置技能（随应用发布）
│   ├── bug-hunter/             # Bug 排查
│   ├── code-review/            # 代码审查
│   ├── commit-generator/       # 提交信息生成
│   ├── custom-skills-router/   # 外部技能路由
│   ├── deepseek-balance/       # DeepSeek 余额查询
│   ├── doc-writer/             # 文档写作
│   ├── github-ops/             # GitHub 操作
│   ├── memory-viewer/          # 记忆查看
│   ├── skill-creator/          # 技能创建
│   ├── view-file/              # 文件查看
│   └── web-browser/            # 网页浏览
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── index.ts            # 应用入口，窗口管理
│   │   ├── preload.ts          # 上下文桥接 API
│   │   ├── config.ts           # 配置管理 + 加密
│   │   ├── ipc-handlers.ts     # IPC 消息处理
│   │   ├── session-store.ts    # 会话持久化（SQLite）
│   │   ├── agent/              # Agent 运行时（ReAct 循环）
│   │   │   ├── runtime.ts
│   │   │   ├── session.ts
│   │   │   └── types.ts
│   │   ├── providers/          # LLM 供应商适配器
│   │   │   ├── openai-compatible.ts
│   │   │   └── anthropic.ts
│   │   ├── tools/              # 工具实现
│   │   │   ├── registry.ts     # 工具注册表
│   │   │   ├── web-fetch.ts
│   │   │   ├── web-search.ts
│   │   │   ├── notebook-edit.ts
│   │   │   ├── skill-tools.ts
│   │   │   └── task-tools.ts
│   │   └── skills/             # 技能加载器
│   ├── renderer/               # React 前端
│   │   ├── App.tsx
│   │   ├── theme-schemes.ts    # 配色方案定义
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx       # 对话面板
│   │   │   ├── ChatInput.tsx       # 输入区域
│   │   │   ├── MessageBubble.tsx   # 消息气泡
│   │   │   ├── ToolCallCard.tsx    # 工具调用卡片
│   │   │   ├── EditorPanel.tsx     # Monaco 编辑器
│   │   │   ├── FileTree.tsx        # 文件树
│   │   │   ├── SessionList.tsx     # 会话列表
│   │   │   ├── SettingsDialog.tsx  # 设置对话框
│   │   │   ├── WorkspaceBar.tsx    # 工作区栏
│   │   │   └── ...
│   │   ├── stores/             # Zustand 状态管理
│   │   └── styles/             # CSS（全局 + 深色）
│   └── shared/                 # 共享类型 & IPC 通道
└── dist/                       # 构建产物（gitignored）
```

## 架构

```
┌─────────────────────────────────────────────────┐
│                 Electron App                     │
│                                                  │
│  ┌──────────────┐    ┌────────────────────────┐ │
│  │ Main Process  │    │  Renderer Process       │ │
│  │ (Node.js)     │◄──►│  (React + TypeScript)   │ │
│  │               │IPC │                         │ │
│  │ Agent Runtime │    │  对话面板                │ │
│  │ 供应商适配层  │    │  Monaco 编辑器           │ │
│  │ 工具注册表    │    │  文件树                  │ │
│  │ 技能加载器    │    │  终端 (xterm.js)         │ │
│  │ SQLite (会话) │    │  设置 / 主题             │ │
│  └──────────────┘    └────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面壳 | Electron 33 |
| 前端 | React 19 + TypeScript |
| 状态管理 | Zustand |
| 代码编辑器 | Monaco Editor |
| 终端 | xterm.js |
| Markdown | react-markdown + remark-gfm + remark-breaks |
| 图表 | mermaid |
| 数据库 | better-sqlite3 |
| 加密 | Node.js crypto (AES-256-GCM) |
| 构建 | Vite (renderer) + tsc (main) |

## 许可

MIT
