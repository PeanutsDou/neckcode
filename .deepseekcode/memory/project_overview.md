---
name: 项目概述
description: DeepSeek Code 项目架构、技术栈、核心设计决策
type: reference
---

# 项目概述

## 定位

桌面 GUI 编码助手，替代 CLI 版 Claude Code 的使用体验问题。

## 核心架构

```
Electron Shell
├── Main Process (Node.js)
│   ├── Agent 运行时 (ReAct 循环)
│   ├── Provider 层 (OpenAI 兼容 / Anthropic SDK)
│   ├── 工具注册 (文件/Shell/Web/任务/Skill)
│   ├── 会话管理 (JSON 持久化)
│   └── 配置系统 (提供商/模型/Agent 参数)
└── Renderer Process (React)
    ├── 对话面板 (流式 Markdown)
    ├── Monaco 编辑器 + 文件树
    ├── 会话列表 + 自动保存
    └── 设置面板 / 技能 / 记忆
```

## 关键技术决策

- 自建 Agent 运行时，不包 claude.exe
- Electron IPC 直连，不走 HTTP 中间层
- Provider 接口化，切换模型只是改参数
- 多会话独立 Agent 实例，每会话独立上下文
- 浅色素雅主题，frameless 自定义标题栏
