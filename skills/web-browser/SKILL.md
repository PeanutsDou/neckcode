---
name: web-browser
description: >
  �?Playwright + Chromium 浏览/操作网页（headless 后台运行，不弹窗）�?  TRIGGER when: 用户�?浏览网站"�?打开网页"�?去某某网站看�?�?搜一下某�?�?操作网页"�?点一�?等涉及网页浏�?交互的请求�?  SKIP: 纯文�?API 类需求（�?WebFetch/WebSearch 即可）�?version: 0.1.0
---

# Web Browser �?Playwright 网页浏览/操作

用本地安装的 Chromium（playwright）headless 模式浏览或操作网页�?
## 执行原则

- **始终 headless=True**，不弹浏览器窗口
- **始终 `py -3 -X utf8`** 启动，避�?Windows GBK 编码报错
- 每个命令单次执行，不要写常驻服务
- 用完自动关闭浏览器，不残留进�?
## 前置检�?
脚本依赖 `playwright`，确认已安装�?
```bash
python -c "import playwright; print('ok')" 2>/dev/null || pip install playwright
```

Chromium 浏览器路径（需要先�?`playwright install chromium` 安装）：

```bash
python -m playwright install chromium 2>&1 | tail -3
```

然后用以下命令找到实际安装路径：

```bash
python -c "import playwright; print(playwright.__file__)"
```

或者直接搜索：
```bash
ls ~/AppData/Local/ms-playwright/chromium-*/chrome-win32/chrome.exe 2>/dev/null
```

## 通用脚本模板

所有操作基于以下模板，按需调整�?
```python
import asyncio
from playwright.async_api import async_playwright

async def main():
    p = await async_playwright().start()
    browser = await p.chromium.launch(
        headless=True,
        args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
    )
    page = await browser.new_page(viewport={'width': 1280, 'height': 800})
    # --- 在此插入具体操作 ---
    await browser.close()
    p.stop()

asyncio.run(main())
```

## 常用操作

### 1. 浏览页面内容

导航�?URL，获取标题和正文文本�?
```python
await page.goto('目标URL', wait_until='domcontentloaded', timeout=15000)
await asyncio.sleep(2)  # �?JS 渲染
title = await page.title()
text = await page.evaluate('document.body.innerText')
print(f'标题: {title}')
print('='*60)
print(text[:8000])
# 若需保存到文件查�?with open('/tmp/page_content.txt', 'w', encoding='utf-8') as f:
    f.write(text)
    print('内容已保存到 /tmp/page_content.txt')
```

### 2. 截图

```python
await page.screenshot(path='screenshot.png', full_page=True)
print('截图已保�?)
```

### 3. 点击元素

```python
# 用文本匹配点�?await page.get_by_text('目标文本', exact=False).click()
await asyncio.sleep(1)
# 或用 CSS 选择�?await page.click('CSS选择�?)
await asyncio.sleep(1)
```

### 4. 输入文本

```python
await page.fill('CSS选择�?, '')
await page.type('CSS选择�?, '要输入的文本', delay=50)
```

### 5. 获取页面/元素文本

```python
# 整页
text = await page.evaluate('document.body.innerText')
# 特定元素
el = await page.query_selector('CSS选择�?)
text = await el.inner_text() if el else '未找�?
```

### 6. 滚动

```python
await page.evaluate('window.scrollBy(0, 500)')  # 向下�?500px
```

### 7. 等待并获取新内容

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
        headless=True,
        args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
    )
    page = await browser.new_page(viewport={'width': 1280, 'height': 800})
    await page.goto('https://www.qidian.com', wait_until='domcontentloaded', timeout=15000)
    await asyncio.sleep(2)
    print(f'标题: {await page.title()}')
    print((await page.evaluate('document.body.innerText'))[:5000])
    await page.screenshot(path='screenshot.png', full_page=True)
    print('截图: screenshot.png')
    await browser.close()
    p.stop()

asyncio.run(main())
"
```

## 扩展说明

- 如需登录态：�?`browser.new_context()` 中传�?`storage_state` 参数
- 如需绕过 Cloudflare 等防护：可调�?user_agent 或用 `page.set_extra_http_headers()`
- 复杂交互时适当增加 `asyncio.sleep()`，给 JS 渲染留时�?
## 知乎

Playwright headless + cookie（`add_cookies`）可正常访问，见 `~/.claude/projects/C--Users-douzhongjun/memory/zhihu_access.md`。
注意不要用 `storage_state` 参数加载 cookie，必须用 `context.add_cookies()`。
## Cookie 刷新通用流程

登录态过期时无法 headless 访问 �?�?headless=False 弹浏览器 �?手动登录 �?�?`context.storage_state(path=...)` 保存。所有认证文件路径见 `~/.claude/projects/C--Users-douzhongjun/memory/credentials.md`�?