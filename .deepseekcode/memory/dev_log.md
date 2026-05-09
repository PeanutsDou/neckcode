---
name: 开发记录
description: 项目重要开发节点和关键决策记录
type: project
---

# 开发记录

## 2026-05-08 — Phase 1 启动

- Electron + React + TypeScript 脚手架搭建
- Agent 运行时移植（ReAct 循环、ChatSession）
- DeepSeek Provider 集成（流式 SSE）
- 基础工具集（读/写/列/删文件 + Shell）
- 对话面板（流式 Markdown、工具卡片）

## 2026-05-08 — Monaco 编辑器 + 工具完善

- Monaco Editor + FileTree + EditorTabs
- edit_file / glob / grep 工具
- 模型切换 UI + 设置面板
- 会话持久化（JSON 自动保存）

## 2026-05-08 — Phase 2 核心功能

- Anthropic Provider
- CLAUDE.md → AGENT.md 自动发现
- Slash 命令、Diff 预览、上下文条
- 危险确认弹框、终端面板（xterm.js）
- 图片粘贴/拖拽输入

## 2026-05-08 — UI 全面重塑

- 深色主题 → 浅色素雅主题
- 自定义 frameless 标题栏
- 汉字替换 emoji 图标
- 发送按钮圆形内嵌输入框
- 可拖拽调整侧边栏和输入框高度

## 2026-05-09 — 多会话 + 技能/记忆系统

- 多会话架构重构（每会话独立 Agent 实例）
- web_fetch / web_search / task_* 工具
- 技能系统（Skills loader + SkillsDialog）
- 记忆系统（MemoryDialog + 持久化）
- AskUserQuestion 弹窗交互
- Provider 配置重构 + API Key 加密
- 暗色主题切换
