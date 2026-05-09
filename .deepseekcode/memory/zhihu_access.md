---
name: Zhihu Access
description: 知乎内容访问的已跑通路径，Playwright + cookie，不走 requests API
type: reference
---

# 知乎访问路径

## 核心要点

知乎有 ZSE 反爬机制，**requests + cookie 直连会 403**。必须用 Playwright 加载 cookie 再访问，让浏览器执行 JS 通过验证。

## 已跑通方案

### 登录（获取 cookie）

```bash
cd ~/.claude && py -3 -X utf8 scripts/zhihu_setup_login.py
```

- 弹 Chromium 浏览器 → 手动登录 → 自动保存 cookie 到 `~/.claude/zhihu_auth.json`
- cookie 格式：Playwright `context.cookies()` 原生格式
- 有效期：约 6 个月

### 读内容（Playwright headless + cookie）

```python
from playwright.async_api import async_playwright
import json, asyncio
from pathlib import Path

async def read_zhihu(url: str):
    p = await async_playwright().start()
    browser = await p.chromium.launch(
        headless=True,
        args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
    )
    context = await browser.new_context(
        viewport={'width': 1280, 'height': 800},
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    cookie_path = Path.home() / '.claude' / 'zhihu_auth.json'
    with open(cookie_path, 'r', encoding='utf-8') as f:
        cookies = json.load(f)
    await context.add_cookies(cookies)

    page = await context.new_page()
    await page.goto(url, wait_until='domcontentloaded', timeout=30000)
    await asyncio.sleep(3)
    title = await page.title()
    text = await page.evaluate('document.body.innerText')
    print(f'标题: {title}')
    print(text[:8000])
    await browser.close()
    p.stop()
```

### 注意事项

- cookie 过期时重新运行登录脚本
- 首次使用需先安装 playwright + Chromium
- Playwright 的 `storage_state` 参数不兼容直接存的 cookie 列表，必须用 `add_cookies()`

## 关键文件

| 文件 | 用途 |
|------|------|
| `~/.claude/zhihu_auth.json` | cookie 存储 |
| `~/.claude/scripts/zhihu_setup_login.py` | 登录脚本 |
