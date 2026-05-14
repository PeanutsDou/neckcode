# Agent 固定化配置面板

> 文档状态：**规划中**
> 创建日期：2026-05-14
> 最后更新：2026-05-14

---

## 一、需求概述

在主界面顶部菜单栏新增「Agent」入口，用户可配置多个专属 Agent。每个专属 Agent 拥有独立的记忆、技能和模型配置，可在对话中切换调用，也可被主 Agent 作为子 Agent 调用。

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

#### 2.2.2 Agent 细节配置（单选入后展示）

| 配置项 | 说明 | UI 形式 |
|--------|------|---------|
| 名称 | Agent 显示名称 | 文本输入框 |
| 记忆 | Agent 专属系统提示/记忆 | 单行或小多行文本输入框（不需要多文档） |
| 技能 | 从已有技能库中选择加载 | 多选列表（展示所有已加载 skill，勾选启用） |
| 模型 | 使用的模型 | 下拉选择（来自已有 Provider 模型配置） |

### 2.3 主界面 Agent 切换

- **位置**：输入框右下角，「完全访问 / 默认权限」枚举**后面**
- **形式**：下拉选择器
- **选项**：「默认 Agent」+ 用户配置的所有专属 Agent
- **行为**：选择后，后续对话使用该 Agent 的配置（记忆 + 技能 + 模型）

### 2.4 主 Agent 调用子 Agent

- 新增工具 `invoke_agent`，主 Agent 可在对话中调用用户配置的专属 Agent
- 调用时传入 prompt，子 Agent 使用自己的配置（记忆/技能/模型）处理后返回结果

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
| `AgentDialog.tsx` | Agent 管理面板主组件 |
| `AgentSelector.tsx` | 输入框旁的 Agent 下拉选择器 |

### 3.3 Agent 运行时

- 复用现有 `AgentRuntime`，每个 Agent 实例化时加载各自的 systemPrompt（记忆）+ skills + model
- 主 Agent 通过 `invoke_agent` 工具调用子 Agent，子 Agent 独立运行一个 turn 后返回结果

### 3.4 IPC 通道

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
| `ChatInput.tsx` | 新增 Agent 下拉选择器 |
| `SettingsDialog.tsx` 或独立 Dialog | Agent 管理面板 |
| `config.ts` | 新增 agents 配置项 |
| `ipc-handlers.ts` | 新增 agents CRUD IPC |
| `registry.ts` | 新增 invoke_agent 工具 |
| `agent/runtime.ts` | 支持子 Agent 调用 |

---

## 五、待确认项

- [ ] Agent 记忆是否需要支持 AGENT.md 那样的长文本，还是限制长度？
- [ ] 子 Agent 调用是否需要独立的上下文窗口（不污染主 Agent 上下文）？
- [ ] Agent 列表是否有数量上限？
- [ ] 是否需要 Agent 的启用/禁用开关？
