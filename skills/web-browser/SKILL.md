---
name: web-browser
description: 用 Playwright + 系统 Edge 浏览器 headless 模式浏览/操作网页。TRIGGER when: 用户说"浏览网站"、"打开网页"、"去某某网站看看"、"搜一下某某"、"操作网页"、"点一下"等涉及网页浏览/交互的请求。SKIP: 纯文本/API 类需求（用 WebFetch/WebSearch 即可）。
version: 0.1.1
---

# Web Browser — Playwright 网页浏览/操作

使用系统自带的 Microsoft Edge 浏览器（Playwright `channel='msedge'`），headless 模式操作网页。

## 执行原则

- **始终 `channel='msedge'`**，直接使用系统 Edge，无需额外安装浏览器
- **始终 headless=True**，不弹浏览器窗口
- **始终 `py -3 -X utf8`** 启动，避免 Windows GBK 编码报错
- 每个命令单次执行，不要写常驻服务
- 用完自动关闭浏览器，不残留进程

## 前置检查

脚本依赖 `playwright`，确认已安装：
```bash
python -c "import playwright; print('ok')" 2>/dev/null || pip install playwright
```

**不需要安装 Chromium** — 用系统自带的 Edge。Edge 由 Playwright 的 `channel='msedge'` 自动发现，无需配置路径。

## 通用脚本模板

```python
import asyncio
from playwright.async_api import async_playwright

async def main():
    p = await async_playwright().start()
    browser = await p.chromium.launch(
        channel='msedge',
        headless=True,
        args=['--disable-blink-features=AutomationControlled']
    )
    page = await browser.new_page(viewport={'width': 1280, 'height': 800})
    # --- insert your code here ---
    await browser.close()
    await p.stop()

asyncio.run(main())
```

## 常用操作

### 1. 浏览页面内容
```python
await page.goto('TARGET_URL', wait_until='domcontentloaded', timeout=15000)
await asyncio.sleep(2)  # wait for JS rendering
title = await page.title()
text = await page.evaluate('document.body.innerText')
print(f'Title: {title}')
print('=' * 60)
print(text[:8000])
```

### 2. 截图
```python
await page.screenshot(path='screenshot.png', full_page=True)
print('Screenshot saved')
```

### 3. 点击元素
```python
await page.get_by_text('TARGET_TEXT', exact=False).click()
await asyncio.sleep(1)
# or CSS selector
await page.click('SELECTOR')
await asyncio.sleep(1)
```

### 4. 输入文本
```python
await page.fill('SELECTOR', '')
await page.type('SELECTOR', 'TEXT', delay=50)
```

### 5. 获取页面/元素文本
```python
text = await page.evaluate('document.body.innerText')
el = await page.query_selector('SELECTOR')
el_text = await el.inner_text() if el else 'NOT FOUND'
```

### 6. 滚动
```python
await page.evaluate('window.scrollBy(0, 500)')
```

### 7. 等待
```python
await page.wait_for_load_state('networkidle', timeout=10000)
await asyncio.sleep(1)
```

## 完整示例：浏览并截图

```bash
py -3 -X utf8 -c "
import asyncio
from playwright.async_api import async_playwright

async def main():
    p = await async_playwright().start()
    browser = await p.chromium.launch(
        channel='msedge',
        headless=True,
        args=['--disable-blink-features=AutomationControlled']
    )
    page = await browser.new_page(viewport={'width': 1280, 'height': 800})
    await page.goto('https://www.example.com', wait_until='domcontentloaded', timeout=15000)
    await asyncio.sleep(2)
    print(f'Title: {await page.title()}')
    print((await page.evaluate('document.body.innerText'))[:5000])
    await page.screenshot(path='screenshot.png', full_page=True)
    print('Screenshot: screenshot.png')
    await browser.close()
    await p.stop()

asyncio.run(main())
"
```

## 扩展说明

- 如需登录态：用 `context.add_cookies()` 注入 cookie
- 如需绕过 Cloudflare 等防护：可调整 user_agent
- 复杂交互时适当增加 `asyncio.sleep()`，给 JS 渲染留时间
