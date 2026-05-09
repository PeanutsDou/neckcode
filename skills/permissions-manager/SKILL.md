---
name: permissions-manager
description: 管理 Claude Code 的三级权限（会话级/项目级/全局级）
runs: permissions-manager.sh
---

# /perm — 权限管理器

交互式管理 Claude Code 的三个权限级别。

## 用法

```
/perm               → 交互式菜单（增删查）
/perm list          → 查看全部三级权限
/perm add <level> <pattern>    → 添加权限模式
/perm remove <level> <pattern> → 移除权限模式
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `level` | `session`（会话级）/ `project`（项目级）/ `global`（全局级） |
| `pattern` | 权限模式，如 `Bash: npm *`、`Bash: git *` |

### 示例

```
/perm
/perm list
/perm add global Bash: npm *
/perm add project Bash: git status
/perm remove session Bash: ls
```
