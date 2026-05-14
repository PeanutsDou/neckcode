# Agent 固定化配置面板

> 文档状态：**规划中**
> 创建日期：2026-05-14
> 最后更新：2026-05-14

---

## 一、需求概述

在顶部菜单栏新增「Agent」入口，用户可配置多个专属 Agent。**调用方式以主 Agent 为主**，主 Agent 根据任务需求并行调用子 Agent，子 Agent 独立上下文运行并返回结果。**不提供用户手动切换 Agent 的 UI 入口。**

---

## 二、功能分解

### 2.1 菜单栏新增「Agent」入口

- **位置**：顶部工具栏，「技能」按钮**之前**
- **触发**：点击打开 Agent 管理面板（Dialog）

### 2.2 Agent 管理面板

- 左侧：Agent 列表（可新增/删除）
- 右侧：选中 Agent 的细节配置

#### 2.2.1 Agent 列表

- 显示所有已配置的 Agent
- 新建 Agent（默认名称，可重命名）
- 删除 Agent（确认弹窗）
- **无数量上限**
- **不需要启用/禁用开关**

#### 2.2.2 Agent 细节配置（选中后展示）

| 配置项 | 说明 | UI 形式 |
|--------|------|---------|
| 名称 | Agent 显示名称 | 文本输入框 |
| 记忆 | Agent 专属系统提示/记忆，**支持长文本** | 多行文本输入框（类似 AGENT.md 编辑区） |
| 技能 | 从已有技能库中选择加载 | 多选列表（展示所有已加载 skill，勾选启用） |
| 模型 | 使用的模型 | 下拉选择（来自已有 Provider 模型配置） |

### 2.3 主 Agent 调用子 Agent

- 新增工具 `invoke_agent`，主 Agent 在对话中调用用户配置的专属 Agent
- **支持并行调用**：主 Agent 可同时发起多个 `invoke_agent`，子 Agent 并发执行
- **独立上下文**：每个子 Agent 拥有独立上下文窗口，不污染主 Agent
- **任务注入**：主 Agent 调用时传入任务描述，作为子 Agent 的初始用户消息（注入到独立上下文中）

### 2.4 不需要的功能（已取消）

- ~~输入框右下角 Agent 枚举下拉~~ — 取消，由主 Agent 统一调度

---

## 三、技术方案（待细化）

### 3.1 数据存储

- Agent 配置持久化到 config.json（与现有配置统一）
- 结构：

```json
{
  "agents": [
    {
      "id": "agent-xxx",
      "name": "代码审查助手",
      "memory": "你是一个专业的代码审查员...",
      "skills": ["code-review-skill"],
      "model": "deepseek-v3"
    }
  ]
}
```

### 3.2 UI 组件

| 组件 | 说明 |
|------|------|
| `AgentDialog.tsx` | Agent 管理面板主组件（列表 + 详情） |

### 3.3 Agent 运行时

- 每个子 Agent 实例化独立的 `AgentRuntime`，加载各自的 systemPrompt（记忆）+ skills + model
- 主 Agent 调用时，将任务描述作为子 Agent 的初始 user message 注入
- 子 Agent 独立运行 turn，完成后返回结果给主 Agent
- **并行调用**：多个 `invoke_agent` 工具调用可在同一批次中并发执行

### 3.4 invoke_agent 工具定义

```json
{
  "name": "invoke_agent",
  "description": "调用一个已配置的专属 Agent 执行任务。可并行调用多个 Agent。",
  "parameters": {
    "agent": "Agent 名称或 ID",
    "task": "任务描述，将作为子 Agent 的用户消息"
  }
}
```

### 3.5 IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `agents:list` | renderer → main | 获取所有 Agent 配置 |
| `agents:save` | renderer → main | 保存 Agent 配置 |
| `agents:delete` | renderer → main | 删除 Agent |

---

## 四、影响范围

| 模块 | 影响 |
|------|------|
| `App.tsx` | 菜单栏新增 Agent 按钮 |
| `config.ts` | 新增 agents 配置项 |
| `ipc-handlers.ts` | 新增 agents CRUD IPC |
| `registry.ts` | 新增 invoke_agent 工具 |
| `agent/runtime.ts` | 支持子 Agent 实例化与并行调用 |

---

## 五、已确认项

- [x] Agent 记忆支持长文本
- [x] 子 Agent 独立上下文，主 Agent 注入任务消息作为初始上下文
- [x] Agent 列表无数量上限
- [x] 不需要启用/禁用开关
- [x] 取消手动切换 Agent 的 UI 入口，由主 Agent 统一调用
- [x] 支持大量并行调用
