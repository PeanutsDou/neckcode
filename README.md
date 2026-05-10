# DeepSeek Code

Desktop GUI coding assistant with multi-model support. Built with Electron + React + TypeScript.

A self-contained desktop application that puts an AI coding agent alongside a code editor — no browser, no terminal, no VS Code extension required.

## Core Concepts

### Agent Runtime

DeepSeek Code runs its own ReAct (Reasoning + Acting) agent loop in the Electron main process. The agent autonomously plans, calls tools, reads/writes files, executes shell commands, and iterates until the task is complete — all streamed to the UI in real time.

### Multi-Provider & Multi-Model

Switch between any OpenAI-compatible provider (DeepSeek, SiliconFlow, Ollama, OpenAI, etc.) and Anthropic models. Each model has its own configurable context window and max output tokens. Models can be hot-switched mid-conversation without losing chat history.

### Skills System

Pluggable skill modules (SKILL.md files) that extend the agent's capabilities. Skills can be:
- **Built-in** — shipped with the application
- **Project-level** — stored in `<workspace>/.deepseekcode/skills/`
- **User-global** — stored in `~/.deepseekcode/skills/`

Skills define trigger conditions and the agent proactively invokes them when relevant.

### Memory & AGENT.md

- **AGENT.md** — Global (`~/.deepseekcode/AGENT.md`) or project-level instructions automatically injected into every conversation's system prompt
- **Memory** — Persistent key-value memory files at `~/.deepseekcode/memory/` that the agent can read and write

### Workspace

The agent operates within a configurable workspace directory (set via the code panel). All file operations are sandboxed to this directory by default. The workspace is independent of the application's own data directory.

## Features

### Chat Interface
- Streaming Markdown rendering with syntax highlighting
- Mermaid diagram support
- Inline diff preview for file edits
- Tool call cards (expandable for details)
- Regenerate responses / edit and resend messages
- Auto-continuation: send new messages while the agent is running

### Code Panel
- Full-screen toggle replaces the chat view
- Tree-style file browser with expand/collapse directories
- Monaco Editor (VS Code kernel) with syntax highlighting for 20+ languages
- Multi-tab editing, Ctrl+S save, right-click "Send Selection to Chat"
- Workspace directory picker with native OS dialog

### Multi-Session
- Multiple independent conversations
- Session list with auto-generated titles
- Persistent to SQLite database
- Session context preserved across model switches

### Theme System
- 6 light color schemes: Default, Qinglan (晴蓝), Zhuqing (竹青), Qinghe (青禾), Nuansha (暖砂), Danzi (淡紫)
- Night Blue (夜蓝) dark mode
- High-contrast region separation
- Ctrl+Scroll to zoom

### Terminal
- Integrated xterm.js terminal
- Runs in the workspace root directory

### Context Management
- CJK-aware token estimation
- Automatic context compaction at 80% capacity
- Per-model configurable context window

## Installation

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- **Windows 10/11** (primary target; macOS/Linux may work with adjustments)

### Setup

```bash
# Clone the repository
git clone https://github.com/PeanutsDou/deepseekcode.git
cd deepseekcode

# Install dependencies
npm install
```

### Development

```bash
# Start both the Vite dev server and Electron
npm run dev
```

This runs:
- Vite dev server on port 5175 (Renderer hot-reload)
- TypeScript compiler for the main process
- Electron window loading from Vite

### Production Build

```bash
# Build renderer
npm run build:renderer

# Build main process
npm run build:main

# Package with electron-builder (TBD)
```

## Configuration

All user data is stored in `~/.deepseekcode/`:

```
~/.deepseekcode/
├── config.json          # Providers, models, preferences
├── deepseekcode.db     # Session data (SQLite)
├── .key                 # Encryption key for API keys
├── AGENT.md             # Global user instructions
├── memory/              # Memory files
└── skills/              # User-installed skills
```

### Adding a Model Provider

1. Open Settings (设置) from the toolbar
2. Click "＋ 添加供应商"
3. Fill in name, Base URL, API key
4. Add models with "+" button — each model gets its own context window and max output settings

Supported Base URL formats:
- DeepSeek: `https://api.deepseek.com/v1`
- SiliconFlow: `https://api.siliconflow.cn/v1`
- Ollama: `http://localhost:11434/v1`
- OpenAI: `https://api.openai.com/v1`

### Setting the Workspace

Use the workspace bar at the top of the code panel, or click "..." to browse with the native folder picker.

## Project Structure

```
deepseekcode/
├── config/                     # Build configuration
│   ├── tsconfig.json
│   ├── tsconfig.main.json
│   ├── tsconfig.renderer.json
│   └── vite.config.ts
├── docs/                       # Design documents
│   ├── REQUIREMENTS.md
│   ├── PLAN.md
│   └── PLAN-CC-CORE.md
├── resources/                  # App icons
├── skills/                     # Built-in skills (shipped with app)
│   ├── bug-hunter/
│   ├── code-review/
│   ├── commit-generator/
│   ├── custom-skills-router/
│   ├── deepseek-balance/
│   ├── doc-writer/
│   ├── github-ops/
│   ├── memory-viewer/
│   ├── skill-creator/
│   ├── view-file/
│   └── web-browser/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # App entry, window management
│   │   ├── preload.ts          # Context bridge API
│   │   ├── config.ts           # Config management + encryption
│   │   ├── ipc-handlers.ts     # IPC message handlers
│   │   ├── agent/              # Agent runtime (ReAct loop)
│   │   │   ├── runtime.ts
│   │   │   ├── session.ts
│   │   │   └── types.ts
│   │   ├── providers/          # LLM provider adapters
│   │   │   ├── openai-compatible.ts
│   │   │   └── anthropic.ts
│   │   ├── tools/              # Tool implementations
│   │   │   ├── registry.ts
│   │   │   ├── web-fetch.ts
│   │   │   ├── web-search.ts
│   │   │   ├── notebook-edit.ts
│   │   │   ├── skill-tools.ts
│   │   │   └── ...
│   │   └── skills/             # Skill loader
│   ├── renderer/               # React frontend
│   │   ├── App.tsx
│   │   ├── theme-schemes.ts    # Color scheme definitions
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ToolCallCard.tsx
│   │   │   ├── EditorPanel.tsx
│   │   │   ├── FileTree.tsx
│   │   │   ├── SessionList.tsx
│   │   │   ├── SettingsDialog.tsx
│   │   │   ├── WorkspaceBar.tsx
│   │   │   └── ...
│   │   ├── stores/             # Zustand state management
│   │   └── styles/             # CSS (global + dark)
│   └── shared/                 # Shared types & IPC channels
└── dist/                       # Build output (gitignored)
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Electron App                     │
│                                                  │
│  ┌──────────────┐    ┌────────────────────────┐ │
│  │ Main Process  │    │  Renderer Process       │ │
│  │ (Node.js)     │◄──►│  (React + TypeScript)   │ │
│  │               │IPC │                         │ │
│  │ Agent Runtime │    │  Chat Panel             │ │
│  │ Provider Layer│    │  Monaco Editor          │ │
│  │ Tool Registry │    │  File Tree              │ │
│  │ Skill Loader  │    │  Terminal (xterm.js)    │ │
│  │ SQLite (Sessions) │ Settings / Themes       │ │
│  └──────────────┘    └────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop shell | Electron 33 |
| Frontend | React 19 + TypeScript |
| State management | Zustand |
| Code editor | Monaco Editor |
| Terminal | xterm.js |
| Markdown | react-markdown + remark-gfm + remark-breaks |
| Mermaid diagrams | mermaid |
| Database | better-sqlite3 |
| Encryption | Node.js crypto (AES-256-GCM) |
| Build | Vite (renderer) + tsc (main) |

## License

MIT
