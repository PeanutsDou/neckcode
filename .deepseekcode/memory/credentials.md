---
name: Stored Credentials
description: 各网站账号凭证，用于浏览器自动登录
type: reference
---

# 凭证存储

## GitHub
- **账号**: PeanutsDou
- **显示名称**: Sesame
- **Token1 (classic, user+repo, 默认)**: `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`
- **Token2 (fine-grained, repo)**: `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`
- **Token3 (fine-grained, repo, 备用)**: `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`
- **认证方式**: Personal Access Token (已存入 git credential store + ~/.bashrc GITHUB_TOKEN)
- **有效期**: 未知，失效时更新

## 知乎
- 手机号: 15006687791
- 密码: zhongjuning0714
- 登录方式: 手机号+密码登录
- 认证文件: `~/.claude/zhihu_auth.json`
- 有效期: ~6个月
- 刷新方式: `python scripts/zhihu_setup_login.py`

## 电商网站
- **京东**: `~/.claude/jd_auth.json`
- **淘宝**: `~/.claude/taobao_auth.json`
- **拼多多**: `~/.claude/pdd_auth.json` (未登录)
- 刷新脚本: `python scripts/login_shop_sites.py`

## 通用说明
- 认证文件为 Playwright storage_state 格式
- 用 `browser.new_context(storage_state=...)` 加载
- 快过期时重新执行对应登录脚本刷新即可
