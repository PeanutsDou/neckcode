---
name: Shop Sites Access
description: 京东/淘宝/拼多多 Playwright 登录态及访问方法
type: reference
---

# 电商网站访问路径

## 登录方式

Playwright headless=False 弹浏览器窗口 → 手动登录 → 关窗口自动保存 storage_state。

## 关键文件

| 网站 | 认证文件 | 状态 |
|------|---------|------|
| 京东 | `~/.claude/jd_auth.json` | ✅ 有效 |
| 淘宝 | `~/.claude/taobao_auth.json` | ✅ 有效 |
| 拼多多 | `~/.claude/pdd_auth.json` | ❌ 无法登录 |

- **批量登录脚本**: `scripts/login_shop_sites.py`

## 使用方式

```python
context = await browser.new_context(
    storage_state=r'~/.claude/jd_auth.json',
    viewport={'width': 1280, 'height': 800}
)
page = await context.new_page()
```

## 访问限制

### 京东
| 操作 | 状态 |
|------|------|
| 首页访问 (www.jd.com) | ✅ |
| 商品详情页 (item.jd.com/xxx.html) | ✅ |
| 搜索 (search.jd.com) | ❌ 反爬 |
| 移动端 (m.jd.com) | ❌ cookie 不互通 |

### 淘宝
| 操作 | 状态 |
|------|------|
| 首页访问 (taobao.com) | ✅ |
| 搜索 (s.taobao.com) | ⚠️ 动态渲染 |
| 商品详情页 | ✅ |

### 拼多多
未能登录（可能需手机验证码），暂不可用。
