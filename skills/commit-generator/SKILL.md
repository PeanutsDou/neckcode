---
name: commit-generator
description: 分析暂存区变更，生成符合 Conventional Commits 规范的提交信息。
---

# 提交信息生成 (Commit Generator)

分析当前 git 暂存区的改动，生成一条简洁的 Conventional Commits 格式提交信息。

## Conventional Commits 格式

```
<type>(<scope>): <description>

[optional body]
```

## Type 列表

- `feat` — 新功能
- `fix` — Bug 修复
- `refactor` — 重构
- `style` — 样式/UI 变更
- `docs` — 文档变更
- `test` — 测试
- `chore` — 构建/依赖/杂项

## 执行方式

1. 执行 `git diff --staged --stat` 查看文件变更
2. 执行 `git diff --staged` 查看具体改动
3. 分析改动内容，确定 type 和 scope
4. 生成提交信息（一行标题，必要时加详细说明）
5. 询问用户是否执行 `git commit`
