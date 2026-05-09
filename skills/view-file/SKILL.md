---
name: view-file
description: >
  查看 Windows 文件内容的通用 skill。支持 .docx 等常见文档格式的读取。
  TRIGGER when: 用户要求"看"、"读"、"打开"某个文件，或查看 .docx 等非纯文本文件的内容。
  SKIP: 纯英文文本文件（.txt, .md, .json, .csv, .py, .js, .ts 等直接用 Read 工具即可）。
version: 0.1.1
---

# View File — Windows 文件查看器

当用户需要查看非纯文本格式的 Windows 文件时，使用本 skill。

## 核心原则

- **纯英文 / 纯代码文件** → 直接用 `Read` 工具读取，不走弯路
- **含中文的文件**（.docx 等二进制文档） → 用脚本提取后走临时文件流程，避免终端编码问题

## 支持的文件类型

| 类型 | 格式 | 读取方式 | 状态 |
|------|------|----------|------|
| Word 文档 | .docx | python-docx → 临时文件 → Read → 删除 | ✅ 已支持 |
| - | - | - | 待补充 |

## .docx 文件读取

依赖：`pip install python-docx`

### 标准流程（务必按此步骤执行）

#### 1. 检测依赖并安装（如需）

```bash
pip install python-docx 2>/dev/null | tail -1
```

#### 2. 提取文本到临时文件

用 Python 将 .docx 内容提取到同目录下的临时 `.txt` 文件（**临时文件命名规则**：`_<原名>_tmp.txt`，下划线前缀便于识别和清理）：

```python
import docx, os, sys

path = "<文件绝对路径>"
d = docx.Document(path)
text = '\n'.join([p.text for p in d.paragraphs])

# 写到临时文件（UTF-8）
tmp = os.path.join(os.path.dirname(path), "_" + os.path.basename(path).replace(".docx", "_tmp.txt"))
with open(tmp, "w", encoding="utf-8") as f:
    f.write(text)

# 输出文件信息供后续参考
print(f"tmp_path:{os.path.abspath(tmp)}")
print(f"chars:{len(text)}")
```

#### 3. 用 Read 读取临时文件

从上一步输出中拿到 `tmp_path`，用 `Read` 工具读取。

#### 4. 删除临时文件

```bash
rm "<tmp_path>"
```

## 扩展指南

如需新增文件类型支持，在此文件中补充：

1. 在"支持的文件类型"表格中新增一行
2. 添加对应的读取脚本和步骤说明
3. 更新 version 字段
