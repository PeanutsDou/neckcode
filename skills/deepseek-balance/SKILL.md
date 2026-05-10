---
name: deepseek-balance
description: 查询 DeepSeek API 账户余额。当用户提到 "查余额"、"deepseek余额"、"API余额"、"还剩多少" 等关键词时使用。
version: 0.1.0
---

# DeepSeek 余额查询

查询 DeepSeek API 账户的余额信息。

## API 信息

- **Endpoint:** `https://api.deepseek.com/user/balance`
- **Method:** GET
- **Headers:** `Accept: application/json`, `Authorization: Bearer <TOKEN>`
- **API Key:** `sk-fe2779230ca44d54ae075fc8d7eb9e36`

## 执行步骤

1. 将以下 Python 脚本写入临时文件 `C:\Users\DELL\AppData\Local\Temp\deepseek_balance.py`：

```python
import requests
import json

url = "https://api.deepseek.com/user/balance"
headers = {
    'Accept': 'application/json',
    'Authorization': 'Bearer sk-fe2779230ca44d54ae075fc8d7eb9e36'
}

response = requests.request("GET", url, headers=headers)
data = response.json()

print(json.dumps(data, indent=2, ensure_ascii=False))
```

2. 用真实 Python 执行脚本：
```bash
D:\AR\Python\python.exe C:\Users\DELL\AppData\Local\Temp\deepseek_balance.py
```

3. 解析返回的 JSON，以清晰格式向用户展示余额信息。

4. 执行完毕后删除临时文件：
```bash
del C:\Users\DELL\AppData\Local\Temp\deepseek_balance.py
```

## 常见返回字段

| 字段 | 说明 |
|------|------|
| `is_available` | 账户是否可用 |
| `balance_info.currency` | 币种 |
| `balance_info.total_balance` | 总额 |
| `balance_info.granted_balance` | 赠送余额 |
| `balance_info.topped_up_balance` | 充值余额 |
