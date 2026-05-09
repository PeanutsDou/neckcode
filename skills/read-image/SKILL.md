---
name: read-image
description: >
  读取图片并用视觉模型描述内容（Qwen3-VL via SiliconFlow）。
  TRIGGER when: 用户发送图片、要求看图、描述图片内容，或给出图片路径。
version: 1.0.0
---

# Read Image — 图片视觉理解

当用户需要查看或描述图片内容时，使用本 skill。

## 核心流程

1. 从用户消息或输入中获取**图片本地路径**
2. 用 Python (PIL) 读取图片 → 转 JPEG quality=85 → base64
3. 调 SiliconFlow API (`Qwen/Qwen3-VL-30B-A3B-Instruct`) 获取文字描述
4. 输出描述内容 + 报告消耗 token 数

## 前置条件

依赖 `Pillow`（通常已预装）：
```bash
pip install Pillow 2>/dev/null | tail -1
```

API 密钥从环境变量 `SILICONFLOW_API_KEY` 读取，已配置在 `~/.claude/settings.json` 的 `env` 中。

## 执行脚本

```python
from PIL import Image
import base64, io, json, requests, sys, os

# === 配置 ===
api_key = os.environ.get("SILICONFLOW_API_KEY", "")
image_path = "<图片绝对路径>"  # 替换为实际路径
prompt = "<描述指令>"          # 例如 "详细描述这张图片的内容"

# === 读图 + 压缩 ===
img = Image.open(image_path).convert("RGB")
buf = io.BytesIO()
img.save(buf, format="JPEG", quality=85)
b64 = base64.b64encode(buf.getvalue()).decode()

# === 调 API ===
payload = {
    "model": "Qwen/Qwen3-VL-30B-A3B-Instruct",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            {"type": "text", "text": prompt}
        ]
    }],
    "max_tokens": 1000
}

resp = requests.post(
    "https://api.siliconflow.cn/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json=payload,
    timeout=60
)
data = resp.json()
content = data["choices"][0]["message"]["content"]
tokens = data["usage"]["total_tokens"]

# === 输出 ===
print(content)
print(f"\n--- tokens: {tokens} ---")
```

## 注意事项

- 图片过大的情况下脚本自动压缩为 JPEG quality=85，通常足够清晰
- 如需要更高细节，可改为 quality=95 或 PNG 格式
- 中文图片内容建议用中文 prompt 描述，效果更好
- 如有多个 API key，第一个参数传入优先级最高
