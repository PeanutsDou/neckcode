# Neck Code

> 桌面 GUI 编程助手，支持多模型切换。基于 Electron + React + TypeScript 构建。

一个自包含的桌面应用，把 AI 编程 Agent 和代码编辑器放在同一个窗口里——不需要浏览器，不需要终端，不需要 VS Code 插件。

---

## 快速开始

| 方式 | 说明 |
|------|------|
| 📦 [下载安装包](https://github.com/PeanutsDou/neckcode/releases/latest) | 双击安装，自动更新 |
| 🚀 [国内加速](https://ghproxy.com/https://github.com/PeanutsDou/neckcode/releases/latest) | GitHub 访问慢时使用 |
| 🛠 源码运行 | `git clone` → `npm install` → `npm run dev` |

**系统要求**：Windows 10/11 · Node.js 18+（仅源码运行需要）

安装后打开应用，在设置里添加 API 供应商即可开始使用。

---

## 核心能力

### Agent 运行时

在主进程中运行 ReAct（推理+行动）循环。Agent 自主规划、调用工具、读写文件、执行 Shell 命令、迭代直到任务完成——流式输出实时可见，工具调用过程透明。

### 多模型 · 热切换

支持任意 OpenAI 兼容供应商（DeepSeek、硅基流动、Ollama、OpenAI 等）及 Anthropic 模型。对话中途切换模型，历史消息不丢失。每个模型独立配置上下文窗口和最大输出。

**内置供应商诊断**：一键检测 API 连通性、流式输出、工具调用、余额——探不到自动跳过。

### 技能系统

可插拔的技能模块（`SKILL.md`），Agent 按触发条件主动调用：

| 技能 | 用途 |
|------|------|
| `bug-hunter` | 排查修复 Bug |
| `code-review` | 代码审查 |
| `commit-generator` | Conventional Commits 生成 |
| `deepseek-balance` | API 余额查询 |
| `doc-writer` | 文档生成 |
| `dsc-release` | 版本发布流程 |
| `github-ops` | GitHub 仓库管理 |
| `memory-viewer` | 记忆查看 |
| `skill-creator` | 创建新技能 |
| `web-browser` | Playwright 网页浏览 |

技能存放位置：
- **内置** — `skills/`，随应用发布
- **项目级** — `<工作区>/.neckcode/skills/`
- **用户全局** — `~/.neckcode/skills/`

### 记忆 & AGENT.md

- **AGENT.md** — `~/.neckcode/AGENT.md` 自动注入 System Prompt
- **记忆系统** — `~/.neckcode/memory/` 持久化键值记忆，Agent 可读写

### 自动更新

应用内置 `electron-updater`。新版本推送到 GitHub Releases 后，所有已安装用户自动收到更新——后台静默下载，重启即完成升级。

---

## 功能亮点

### 对话
- Markdown 渲染 + 代码高亮 + Mermaid 图表
- 文件修改内联 Diff 预览
- 工具调用卡片（点击展开详情）
- 重新生成 / 编辑后重发
- 四芒星火花加载动画
- 会话滚动位置记忆

### 代码面板
- 全屏切换 · Monaco 编辑器 · 多标签页
- 树形文件浏览器 · 右键发送选中内容到聊天
- 工作区目录选择器

### 多会话
- SQLite 持久化 · 自动标题生成 · 独立上下文

### 主题
- 6 套浅色配色 · 深色模式 · Ctrl+滚轮缩放

### 终端
- xterm.js 集成终端，工作区根目录运行

---

## 安装后配置

所有用户数据在 `~/.neckcode/`：

```
~/.neckcode/
├── config.json      # 供应商、模型、偏好
├── neckcode.db  # 会话（SQLite）
├── .key             # API Key 加密密钥
├── AGENT.md         # 全局指令
├── memory/          # 记忆文件
└── skills/          # 用户安装的技能
```

### 添加供应商

设置 → 选择供应商 → 填写 Base URL 和 API Key → 点「诊断」验证。常见 Base URL：

| 供应商 | Base URL |
|--------|----------|
| DeepSeek | `https://api.deepseek.com/v1` |
| 硅基流动 | `https://api.siliconflow.cn/v1` |
| Ollama | `http://localhost:11434/v1` |
| OpenAI | `https://api.openai.com/v1` |

---

## 开发者

### 源码运行

```bash
git clone https://github.com/PeanutsDou/neckcode.git
cd neckcode
npm install
npm run dev          # Vite + tsc + Electron 同时启动
```

### 打包

```bash
npm run build        # 编译 TypeScript + Vite 打包前端
npm run pack         # → release/win-unpacked/（免安装目录）
npm run dist         # → release/Neck Code Setup X.X.X.exe（安装包）
```

> 国内环境需设置镜像：
> ```powershell
> $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
> $env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
> ```
> 图标嵌入步骤需要管理员权限。

### 发布流程

参见 `skills/dsc-release/SKILL.md`。核心步骤：改版本号 → `npm run dist` → 修复 `latest.yml` 文件名 → `gh release create`。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面壳 | Electron 33 |
| 前端 | React 19 + TypeScript · Zustand |
| 编辑器 | Monaco Editor |
| 终端 | xterm.js |
| Markdown | react-markdown + remark-gfm |
| 图表 | Mermaid |
| 数据库 | better-sqlite3 |
| 加密 | AES-256-GCM |
| 构建 | Vite + tsc · electron-builder (NSIS) |
| 更新 | electron-updater + GitHub Releases |

## 许可

MIT
