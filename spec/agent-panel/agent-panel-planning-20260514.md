# Agent 固定化配置面板

> 文档状态：**执行中**
> 创建日期：2026-05-14
> 最后更新：2026-05-16

---

## 一、需求概述

> **核心目标**：让用户可配置多个专属 Agent，由主 Agent 在对话中按需并行调度，每个子 Agent 独立上下文执行任务并返回结果。
> **关键思路**：复用现有 AgentRuntime 架构，子 Agent 使用独立的记忆（长文本 system prompt）+ 技能（从已有库勾选）+ 模型（从已配置模型选），主 Agent 通过 `invoke_agent` 工具注入任务消息并获取结果。

---

## 二、架构设计

```
┌─────────────────────────────────────────────────────┐
│ 用户                                                   │
│                                                     │
│  工具栏 [Agent] 按钮 → AgentDialog                     │
│  ├── Agent 列表（新增/删除）                            │
│  └── Agent 细节（名称/记忆/技能/模型）                   │
│                                                     │
│  职责：配置 Agent，不参与运行时调用                        │
└──────────────────────┬──────────────────────────────┘
                       │ agents config → config.json
                       ▼
┌─────────────────────────────────────────────────────┐
│ 主 Agent（ChatPanel 当前对话）                          │
│                                                     │
│  ├── 接收用户任务                                      │
│  ├── 分析任务，决定调用哪些子 Agent                       │
│  ├── 通过 invoke_agent 工具并行发起调用                  │
│  │   ├── Agent A（独立上下文 + 记忆 + 技能 + 模型）       │
│  │   ├── Agent B（独立上下文 + 记忆 + 技能 + 模型）       │
│  │   └── Agent C ...                                 │
│  ├── 收集子 Agent 返回结果                              │
│  └── 综合结果，回复用户                                 │
│                                                     │
│  职责：调度子 Agent，不直接执行子 Agent 的任务             │
└──────────────────────┬──────────────────────────────┘
                       │ invoke_agent(task)
                       ▼
┌─────────────────────────────────────────────────────┐
│ 子 Agent Runtime（每个子 Agent 独立实例）                │
│                                                     │
│  ├── 独立 AgentRuntime 实例                           │
│  ├── 加载配置的 systemPrompt（记忆）                    │
│  ├── 加载配置的 skills                                │
│  ├── 使用配置的 model                                 │
│  ├── 独立上下文窗口（不污染主 Agent）                    │
│  ├── 主 Agent 注入的任务消息作为初始 user message        │
│  ├── 执行 tool-calling 循环                           │
│  └── 返回最终结果给主 Agent                            │
│                                                     │
│  职责：独立执行子任务，返回结果                           │
└─────────────────────────────────────────────────────┘
```

### 职责边界

| 边界 | 归谁 | 不归谁 |
|------|------|--------|
| Agent 配置 CRUD | AgentDialog + config.ts | — |
| 选择调用哪个 Agent | 主 Agent（AI 决策） | 用户手动选择（已取消） |
| 子 Agent 上下文 | 独立窗口，不污染主 Agent | 共享上下文 |
| 并行调用 | AgentRuntime 支持同批次并发 | — |

---

## 三、功能分解

| # | 模块 | 作用 | 依赖 | 状态 |
|---|------|------|------|------|
| 1 | 数据模型 + 持久化 | config.json 新增 agents 数组，config.ts 读写 | — | ✅ 已完成 |
| 2 | Agent 管理 UI | 工具栏入口 + AgentDialog（列表 + 详情编辑） | 1 | ✅ 已完成 |
| 3 | IPC 通道 | agents:list / agents:save / agents:delete | 1 | ✅ 已完成 |
| 4 | invoke_agent 工具 | 主 Agent 调用子 Agent 的工具定义 + 执行 | 1,3 | ✅ 已完成 |
| 5 | 子 Agent Runtime | 独立 AgentRuntime 实例化，注入记忆/技能/模型/任务 | 1,4 | ✅ 已完成 |
| 6 | 并行调用支持 | 多个 invoke_agent 在同一批次并发执行 | 5 | ✅ 已完成 |

---

## 四、技术方案

### 4.1 数据存储

config.json 新增 `agents` 数组：

```json
{
  "agents": [
    {
      "id": "agent-xxx",
      "name": "代码审查助手",
      "memory": "你是一个专业的代码审查员，擅长发现逻辑漏洞和性能问题...",
      "skills": ["code-review-skill"],
      "model": "deepseek-v3"
    }
  ]
}
```

### 4.2 UI 组件

| 组件 | 说明 | 状态 |
|------|------|------|
| `AgentDialog.tsx` | Agent 管理面板主组件，左侧列表 + 右侧详情 | 新建 |
| `App.tsx` | 工具栏新增 Agent 按钮（在「技能」之前） | 修改 |

### 4.3 IPC 通道

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `agents:list` | renderer → main | — | Agent 配置数组 |
| `agents:save` | renderer → main | Agent 配置对象 | — |
| `agents:delete` | renderer → main | agentId | — |

### 4.4 invoke_agent 工具定义

```json
{
  "type": "function",
  "function": {
    "name": "invoke_agent",
    "description": "调用已配置的专属 Agent 执行任务。可同时并行调用多个 Agent。",
    "parameters": {
      "type": "object",
      "properties": {
        "agent": {
          "type": "string",
          "description": "要调用的 Agent 名称或 ID"
        },
        "task": {
          "type": "string",
          "description": "任务描述，将作为子 Agent 的初始用户消息注入到独立上下文中"
        }
      },
      "required": ["agent", "task"]
    }
  },
  "readOnly": true
}
```

### 4.5 子 Agent Runtime 实现

- 读取 Agent 配置 → 构造 `AgentRuntime`（systemPrompt = memory）
- 加载 skills → 注入到子 Agent 的 tool registry
- 选择 model → 通过 `createProvider(model)` 创建独立 provider
- `runUserTurn(task)` → 独立 tool-calling 循环 → 返回最终 `text`
- 上下文完全隔离，不写入主 Agent 的 ChatSession

---

## 五、影响范围

| 文件 | 改动类型 | 改动说明 |
|------|----------|----------|
| `src/main/config.ts` | 修改 | 新增 agents 配置类型与读写 |
| `src/shared/types.ts` | 修改 | 新增 AgentConfig 类型 |
| `src/main/ipc-handlers.ts` | 修改 | 新增 agents CRUD IPC handlers |
| `src/main/tools/registry.ts` | 修改 | 新增 invoke_agent 工具定义与执行 |
| `src/main/agent/runtime.ts` | 修改 | 支持子 Agent 实例化 |
| `src/renderer/App.tsx` | 修改 | 工具栏新增 Agent 按钮 |
| `src/renderer/components/AgentDialog.tsx` | 新建 | Agent 管理面板 |
| `src/renderer/stores/app-store.ts` | 可能修改 | Agent 列表状态 |

---

## 六、执行规划

### Phase 1：数据层（配置 + IPC）

**准入**：无
**任务**：
- P1.1 config.ts 新增 agents 类型定义与存取
- P1.2 shared/types.ts 新增 AgentConfig 接口
- P1.3 ipc-handlers.ts 实现 agents:list / save / delete
**产物**：可通过 IPC 读写 Agent 配置
**验证**：config.json 中手动写入 agents 数据，通过 IPC 可正确读取

### Phase 2：UI 层（AgentDialog）

**准入**：Phase 1 完成
**任务**：
- P2.1 新建 AgentDialog.tsx（左侧列表 + 右侧详情表单）
- P2.2 App.tsx 工具栏新增 Agent 按钮
- P2.3 名称编辑、记忆长文本输入、技能多选、模型下拉
**产物**：可视化 Agent 管理面板
**验证**：UI 可新增/编辑/删除 Agent，数据持久化到 config.json

### Phase 3：invoke_agent 工具 + 子 Agent Runtime

**准入**：Phase 1 完成
**任务**：
- P3.1 registry.ts 注册 invoke_agent 工具
- P3.2 实现子 Agent 实例化：读取配置 → AgentRuntime(systemPrompt) → 注入 skills → 设置 model
- P3.3 invoke_agent 执行：创建子 Agent → runUserTurn(task) → 返回 result.text
**产物**：主 Agent 可通过工具调用单个子 Agent
**验证**：在对话中让主 Agent 调用一个子 Agent，子 Agent 独立返回结果

### Phase 4：并行调用

**准入**：Phase 3 完成
**任务**：
- P4.1 invoke_agent 标记 readOnly: true，使多个调用可进入同一并发批次
- P4.2 验证同批次多个子 Agent 并发执行
**产物**：支持并行 Agent 调用
**验证**：主 Agent 同时调用 3 个子 Agent，三者并发执行

### Phase 5：集成测试

**准入**：Phase 4 完成
**任务**：
- P5.1 端到端测试：配置 Agent → 对话触发调用 → 子 Agent 执行 → 结果返回
- P5.2 并行测试：多 Agent 并发调用，确认不相互干扰
- P5.3 上下文隔离测试：确认子 Agent 的工具调用不泄露到主 Agent
**产物**：完整的 Agent 配置→调用→返回闭环

---

## 七、测试计划

| 层级 | 测试内容 | 预期结果 | 不通过说明 |
|------|----------|----------|------------|
| L1 | Agent 配置 CRUD | UI 新增/编辑/删除，config.json 正确持久化 | 数据模型或 IPC 问题 |
| L2 | invoke_agent 单调用 | 主 Agent 调用子 Agent，子 Agent 独立返回结果 | Runtime 实例化或上下文注入问题 |
| L3 | 并行调用 | 3 个子 Agent 并发执行，结果正确且不互相干扰 | 并发控制或 tool batch 分组问题 |
| L4 | 上下文隔离 | 子 Agent 的工具调用不污染主 Agent 上下文 | ChatSession 未隔离 |

---

## 八、已确认项

- [x] Agent 记忆支持长文本（多行输入框）
- [x] 子 Agent 独立上下文，主 Agent 注入任务消息作为初始上下文
- [x] Agent 列表无数量上限
- [x] 不需要启用/禁用开关
- [x] 取消手动切换 Agent 的 UI 入口，由主 Agent 统一调用
- [x] 支持大量并行调用（invoke_agent 标记 readOnly）
