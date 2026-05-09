---
name: github-ops
description: 操作 PeanutsDou 的 GitHub 仓库，管理 PR/Issue/Release 等
---

# GitHub 操作 Skill

## 前置条件

- 已通过 `gh auth login` 配置 PAT token，账号 PeanutsDou
- 所有操作通过 `gh` CLI 执行，无需手动构造 curl

## 可用仓库

| 仓库 | 可见性 | 说明 |
|------|--------|------|
| AI- | private | |
| AI_Assistant | private | |
| aseprite-builder | public | |
| douzhongjun | private | |
| Game-And-Tools | public | |
| learn-dou | private | |
| peanuts | public | |
| soul-writer | public | |
| soul-writer-v1.0 | private | |

## 常用操作

### 查看仓库状态
```bash
gh repo view PeanutsDou/<repo>         # 查看仓库详情
gh repo list PeanutsDou --limit 30     # 列出所有仓库
```

### PR 操作
```bash
gh pr list -R PeanutsDou/<repo>        # 列出 PR
gh pr view <number> -R PeanutsDou/<repo>  # 查看 PR 详情
gh pr create -R PeanutsDou/<repo>      # 创建 PR
```

### Issue 操作
```bash
gh issue list -R PeanutsDou/<repo>     # 列出 Issue
gh issue view <number> -R PeanutsDou/<repo>  # 查看 Issue
gh issue create -R PeanutsDou/<repo>   # 创建 Issue
```

### 仓库管理
```bash
gh repo create PeanutsDou/<name> --public/--private
gh api repos/PeanutsDou/<repo>/contents/  # 获取文件列表
gh api repos/PeanutsDou/<repo>/git/trees/main?recursive=1  # 获取完整树
```

## 注意

- 涉及写操作（创建 PR、push、merge 等）前先跟用户确认
- 读操作（查看 PR、Issue、文件内容等）可直接执行
- 私有仓库的内容注意不要泄露
