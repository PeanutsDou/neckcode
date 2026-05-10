---
name: custom-skills-router
description: 路由到外部自定义技能 —— 八字/干支/五行计算 (goodday-bazi)、实习周报/周记 DOCX 生成 (internship-weekly-report)、或 UE 资产蓝图/材质图分析 (ue-material-graph-analysis)。当用户需要算命、八字、运势、五行、实习周报、实习周记、周报文档、UE 资产分析、蓝图分析、材质编辑器分析时使用。
---

# 自定义技能路由

外部技能路径：`D:\窦中君\实习\产出\skills\`

## 路由逻辑

检测用户意图，路由到对应外部技能：

### 1. 八字 / 运势 / 五行 → goodday-bazi

**触发词：** 八字、生辰、运势、五行、干支、流年、大运、算命、问事、日主

**行为：**
1. 读取 `D:\窦中君\实习\产出\skills\goodday-bazi\SKILL.md`
2. 严格遵循该 SKILL.md 的工作流程和规则
3. 脚本路径为 `D:\窦中君\实习\产出\skills\goodday-bazi\scripts\goodday_bazi.py`
4. 数据路径为 `D:\窦中君\实习\产出\skills\goodday-bazi\data\`

### 2. 实习周报 / 周记 → internship-weekly-report

**触发词：** 实习周报、实习周记、周报、周记、实习记录、实习文档

**行为：**
1. 读取 `D:\窦中君\实习\产出\skills\internship-weekly-report\SKILL.md`
2. 严格遵循该 SKILL.md 的工作流程和规则
3. 脚本路径为 `D:\窦中君\实习\产出\skills\internship-weekly-report\scripts\weekly_report.py`
4. 输出目录固定为 `D:\窦中君\毕业论文与设计\实习周报`

### 3. UE 资产图分析 → ue-material-graph-analysis

**触发词：** UE、Unreal、蓝图、材质、材质编辑器、Blueprint、Material、MaterialGraphNode、MaterialExpression、K2Node、EdGraphNode、UE 节点图、UE 资产分析

**技能目录：** `C:\Users\DELL\.codex\skills\ue-material-graph-analysis\`

**行为：**
1. 读取 `C:\Users\DELL\.codex\skills\ue-material-graph-analysis\SKILL.md`
2. 严格遵循该 SKILL.md 的 Mandatory Workflow（先解析后分析）和分析步骤
3. 根据粘贴的 UE 图文本类型选择解析器：
   - 材质图（MaterialGraphNode / MaterialExpression）→ `scripts\ue_material_graph_to_json.py`
   - 蓝图图（K2Node / EdGraphNode）→ `scripts\ue_graph_clipboard_to_json.py`
4. 用法示例：
   ```powershell
   python "C:\Users\DELL\.codex\skills\ue-material-graph-analysis\scripts\ue_material_graph_to_json.py" input.txt -o graph.json
   python "C:\Users\DELL\.codex\skills\ue-material-graph-analysis\scripts\ue_graph_clipboard_to_json.py" input.txt -o graph.json
   Get-Clipboard | python "C:\Users\DELL\.codex\skills\ue-material-graph-analysis\scripts\ue_graph_clipboard_to_json.py" -o graph.json
   ```
5. 读取 JSON 输出后按 SKILL.md 的 Material/Blueprint Analysis Procedure 进行解释
6. 在编辑器内导出功能，使用 `scripts\export_ue_asset_graphs.py`（需要 UnrealEditor-Cmd 环境）

### 4. 无匹配

如果用户请求不匹配以上任一技能，告诉用户可用的技能范围。

## 注意事项

- 必须先读取对应 SKILL.md 再执行，确保遵循外部技能的最新规则
- 所有脚本路径使用绝对路径，避免工作目录问题
- 不修改外部技能目录中的任何文件
