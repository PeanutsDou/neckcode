---
name: ai-ta-skill
description: 这是 AITA 的通用总路由 skill，面向渲染向 TA 日常问题。凡是属于渲染向TA的日常工作（shader编写与问题排查，bug问题排查与修复）相关问题，都可调用本技能。由本技能决定调用哪个子技能或按什么顺序针对需求组合分析。
---

# AI-TA-SKILL

这是 AITA 的通用总路由 skill，面向渲染向 TA 日常问题。

# rules:
- 这个skill本身并不承担任何解决问题的能力，它只是根据用户的问题，调用对应的子技能，由子技能去解决问题。
- 获取到用户需求之后，要先根据需求精准锁定最合适的skill及其最适合解决问题的方法，再调用该skill的方法。
- 面对简单任务，不要过度规划，能用一个skill解决就不要用多个，能够直接简洁快速的回答用户的问题是最高优先级。
- 面对复杂任务，要先根据需求，细粒度的定位子技能-解决方法，再做出一套合理的执行规划，最后严格按照规划执行。
- 读取 `SKILL.md`、`reference/*.md`、`references/*.md` 等 UTF-8 文档时，严禁直接用 PowerShell `Get-Content` 输出到默认控制台；必须使用 UTF-8 明确读取方式，优先使用 Python：`$env:PYTHONIOENCODING='utf-8'; $env:PYTHONUTF8='1'; @'from pathlib import Path; print(Path(r''<ABS_PATH>'').read_text(encoding=''utf-8''))'@ | py -3 -`
- 若必须在 PowerShell 内读取文本文件，也要显式指定编码并确保输出端为 UTF-8；如果控制台仍乱码，立即改用上面的 Python 方式，不要继续用 `Get-Content` 硬读。

# 子技能与职责：
- `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\bug-replay-helper\SKILL.md`
  G66项目 Bug 内容综合分析助手。当用户描述一个 Bug 现象、提供单号、需要排查原因、寻找历史相似案例、确定负责管线或负责人时，必须使用本技能。触发关键词包括但不限于：bug分析、单号查询、找相似bug、历史案例、出了问题找谁、负责人、管线、排查、复现、修复建议、谁来跟、查一下这个单、480936是什么问题。
- `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\renderdoc-helper\SKILL.md`
  RenderDoc 帧分析助手。当用户提供一个本地 .rdc 文件的绝对路径，需要分析该帧的任何渲染相关信息时，必须使用本技能。触发关键词包括但不限于：rdc、renderdoc、帧分析、分析这个rdc、看一下这帧、这帧画了什么、渲染管线分析、DrawCall、Pass、Shader、纹理、资产、性能热点。
- `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\shader-helper\SKILL.md`
  基于内部 Shader 库架构的理解、编写与编译辅助。当用户需要编写、调试、分析内部 Shader（包含 NSF 结构、宏定义、材质参数、BxDF、渲染管线），或询问如何编译 Shader、排查编译报错时调用。
- `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\auto-repro-executor\SKILL.md`
  用于执行渲染向 Bug 自动复现和时光机回放定位。当用户需要在游戏内复现场景、通过时光机回放定位问题帧时调用。

# 基础路由：
- 用户给的是 bug 单号、现象描述、历史案例、负责人归属、SVN 变更、相似问题，先调用 `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\bug-replay-helper\SKILL.md`。
- 用户给的是 `.rdc` 抓帧文件，先调用 `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\renderdoc-helper\SKILL.md`。
- 用户直接问 Shader 源码、NSF 入口、宏分支、编译报错、材质参数定义，直接调用 `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\shader-helper\SKILL.md`。
- 用户需要复现 bug、时光机回放、在游戏内执行命令，调用 `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\auto-repro-executor\SKILL.md`。

# 组合流程：
- 一般信息齐全时，优先顺序是：`bug-replay-helper -> renderdoc-helper -> shader-helper`。
- 当需要复现场景时，优先顺序是：`auto-repro-executor -> renderdoc-helper -> shader-helper`。
- 当 `renderdoc-helper` 已经定位到具体 draw、pass 或反编译 HLSL，且还需要解释贴图/常量的业务语义、宏分支来源、对应的 `.nsf/.hlsl` 文件、实际可改位置时，必须继续调用 `K:\tool_full_x64\ta_standalone_tools\aita_skills\SKILL\shader-helper\SKILL.md` 查询源码。
- 如果 `bug-replay-helper` 的历史结论已经和 `renderdoc-helper` 的抓帧证据高度一致，可以停止，不必强行继续查 Shader 源码。
- 如果 `renderdoc-helper` 已经在资源绑定、Pass 链路或反编译 HLSL 层面足够定位责任面，也可以直接输出结论，不必强行升级到 `shader-helper`。
- shader-helper 的 shader-source 和 compiler 路径需从 `K:\tool_full_x64\ta_standalone_tools\aita_skills\config.json` 读取。
