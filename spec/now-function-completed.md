# 已完成功能模块

> 最后更新：2026-05-14

## 一、应用框架

| 模块 | 状态 | 说明 |
|------|------|------|
| Electron 主进程 | ✅ | BrowserWindow 管理、系统托盘、自动更新 |
| React 渲染进程 | ✅ | Vite + React 19，Zustand 状态管理 |
| 无框窗口 | ✅ | 自定义标题栏，双击最大化，拖拽移动 |
| 窗口状态持久化 | ✅ | 位置/大小记忆，关闭行为（托盘/退出/询问） |
| 深浅主题 | ✅ | light/dark 切换，浅色模式多套配色方案 |
| 字体缩放 | ✅ | Ctrl+滚轮缩放，持久化 |
| 自动更新 | ✅ | electron-updater，服务器分发 + GitHub Release |

## 二、Agent 引擎

| 模块 | 状态 | 说明 |
|------|------|------|
| AgentRuntime | ✅ | 多轮 tool-calling 循环，maxTurns 控制 |
| 流式输出 | ✅ | SSE 解析，delta 实时推送 UI |
| Reasoning 展示 | ✅ | DeepSeek 思维链 reasoning_content 捕获与展示 |
| 上下文管理 | ✅ | Token 估算/计数，自动压缩，压缩失败回退 |
| 视觉解析 | ✅ | 图片 → 文本模型 + 多模态解析模型双管道 |
| 队列消息 | ✅ | Agent 运行中的用户消息排队处理 |
| 中断/重试 | ✅ | AbortController，错误分类与建议 |

## 三、Provider

| 模块 | 状态 | 说明 |
|------|------|------|
| OpenAI-compatible | ✅ | 流式/非流式，tool calling，vision |
| Anthropic | ✅ | Messages API 适配 |
| 多 Provider 管理 | ✅ | 添加/删除/切换，API Key 管理 |
| 模型配置 | ✅ | 按模型设置 contextLimit、maxTokens、mode |
| Provider 诊断 | ✅ | 连通性、流式、工具调用、余额查询 |
| 余额查询 | ✅ | DeepSeek / SiliconFlow 余额 |

## 四、工具系统（18 个）

| 工具 | 状态 | 说明 |
|------|------|------|
| read_file | ✅ | UTF-8 文本读取，工作区路径限制 |
| write_file | ✅ | 写入文件，自动创建目录 |
| list_dir | ✅ | 列出目录，文件夹优先排序 |
| delete_file | ✅ | 删除文件，高风险确认 |
| run_shell | ✅ | PowerShell/Bash，60s 超时，1MB 缓冲 |
| edit_file | ✅ | 精确字符串替换，唯一性校验，返回 diff |
| glob | ✅ | 通配符文件搜索，排除 node_modules/.git |
| grep | ✅ | 正则搜索，文件类型过滤，结果限制 |
| web_fetch | ✅ | HTTP/HTTPS 抓取，15min 缓存 |
| web_search | ✅ | DuckDuckGo 搜索 |
| task_create | ✅ | 创建任务 |
| task_get | ✅ | 获取任务详情 |
| task_list | ✅ | 列出所有任务 |
| task_update | ✅ | 更新任务状态/依赖 |
| notebook_edit | ✅ | Jupyter Notebook 单元格编辑 |
| list_skills | ✅ | 列出可用技能 |
| invoke_skill | ✅ | 调用技能 |
| ask_user_question | ✅ | 向用户提问，支持单选/多选 |

## 五、权限系统

| 模块 | 状态 | 说明 |
|------|------|------|
| 二级权限 | ✅ | default / fullAccess |
| 工具确认弹窗 | ✅ | write/delete/edit/shell/notebook 需确认 |
| 风险评级 | ✅ | low / medium / high |
| 工作区隔离 | ✅ | 默认模式禁止访问工作区外路径 |
| 命令逃逸检测 | ✅ | 检测 shell 命令中的绝对路径和 `..` |

## 六、会话管理

| 模块 | 状态 | 说明 |
|------|------|------|
| SQLite 持久化 | ✅ | better-sqlite3，消息完整保存 |
| 会话列表 | ✅ | 搜索、置顶、重命名、删除 |
| 会话切换 | ✅ | 加载历史消息到 Agent |
| 标题生成 | ✅ | AI 自动生成会话标题 |
| 模型绑定 | ✅ | 每个会话独立模型选择 |

## 七、Skills 系统

| 模块 | 状态 | 说明 |
|------|------|------|
| SKILL.md 加载 | ✅ | 多路径发现，frontmatter 解析 |
| 内置技能 | ✅ | dsc-release |
| 项目技能 | ✅ | workspace/.neckcode/skills |
| 用户全局技能 | ✅ | ~/.neckcode/skills |
| skills:invoke IPC | ✅ | UI 触发调用 |
| 技能管理 UI | ✅ | SkillsDialog 查看/重载 |

## 八、编辑器面板

| 模块 | 状态 | 说明 |
|------|------|------|
| 文件树 | ✅ | 目录展开/折叠，文件选择 |
| Monaco 编辑器 | ✅ | 语法高亮，多 Tab |
| 代码面板切换 | ✅ | 聊天 / 代码面板 |
| 分栏拖拽 | ✅ | ResizeHandle 调整宽度 |

## 九、终端

| 模块 | 状态 | 说明 |
|------|------|------|
| xterm 终端 | ✅ | PowerShell/Bash，工作区目录 |
| 输入/输出 | ✅ | 实时数据推送 |

## 十、UI 组件

| 模块 | 状态 | 说明 |
|------|------|------|
| ChatPanel | ✅ | 消息列表、输入框、附件、模型切换 |
| MessageBubble | ✅ | Markdown 渲染，代码高亮，Mermaid |
| StreamingBubble | ✅ | 流式消息实时展示 |
| ToolCallCard | ✅ | 工具调用卡片，展开/折叠 |
| ContextBar | ✅ | 上下文使用率进度条 |
| SettingsDialog | ✅ | Provider/模型/通用设置 |
| SessionList | ✅ | 会话列表，搜索，右键菜单 |
| DiffPreview | ✅ | edit_file 差异预览 |
| ImageViewer | ✅ | 图片查看器 |
| AskDialog | ✅ | 多问题弹窗 |
| CloseDialog | ✅ | 关闭行为选择 |
| UpdateBanner | ✅ | 更新通知横幅 |
| VirtualizedEntryList | ✅ | react-virtuoso 虚拟列表 |

## 十一、AGENT.md / Memory

| 模块 | 状态 | 说明 |
|------|------|------|
| AGENT.md 加载 | ✅ | 多级发现（全局→项目），合并 |
| Memory 系统 | ✅ | ~/.neckcode/memory/ 读写 |
| Memory UI | ✅ | MemoryDialog 查看/删除 |

## 十二、发布系统

| 模块 | 状态 | 说明 |
|------|------|------|
| electron-builder | ✅ | NSIS 安装包，x64 |
| 服务器分发 | ✅ | nginx + SCP 上传 + latest.yml |
| GitHub Release | ✅ | gh CLI 创建 |
| Cloudflare Tunnel | ✅ | HTTPS 下载页 |
| 差异更新 | ✅ | blockmap 增量 |
