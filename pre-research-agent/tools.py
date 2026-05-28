# -*- coding: utf-8 -*-
"""
Tool Registry — 内置三个工具 + 动态脚本工具。
Agent 可以通过 write_file + run_shell 自我扩展。
"""
import os
import subprocess
import json
from pathlib import Path
from typing import Callable

WORKSPACE = Path(__file__).parent.resolve()
TOOLS_DIR = WORKSPACE / "toolshed"  # Agent 创建的工具放这里


# ═══════════════════════════════════════════════
# 工具实现
# ═══════════════════════════════════════════════

def run_shell(args: dict) -> str:
    """执行任意 PowerShell 命令。"""
    command = args.get("command", "")
    if not command:
        return "ERROR: command is required"
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", command],
            capture_output=True, text=True, timeout=60,
            cwd=str(WORKSPACE),
        )
        output = result.stdout.strip()
        if result.stderr.strip():
            output += "\n" + result.stderr.strip()
        return (output or "(无输出)")[:8000]
    except subprocess.TimeoutExpired:
        return "命令执行超时 (60s)"
    except Exception as e:
        return f"命令执行失败: {e}"


def read_file(args: dict) -> str:
    """读取工作区内的文件内容。"""
    raw_path = args.get("path", "")
    if not raw_path:
        return "ERROR: path is required"
    file_path = Path(raw_path)
    if not file_path.is_absolute():
        file_path = WORKSPACE / raw_path
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
        return content[:8000] if len(content) > 8000 else content
    except FileNotFoundError:
        return f"文件不存在: {file_path}"
    except Exception as e:
        return f"读取失败: {e}"


def write_file(args: dict) -> str:
    """在工作区写入任意类型的文件。脚本类写入后自动成为可调用工具。

    args:
        filename: str  — 文件名（.py .bat .ps1 .txt .json 等）
        content:  str  — 文件内容
    """
    filename = args.get("filename", "")
    content = args.get("content", "")

    if not filename or not content:
        return "ERROR: filename and content are required"

    path = TOOLS_DIR / filename
    try:
        TOOLS_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

        ext = path.suffix
        extra = " → 下次可直接调用" if ext in (".py", ".bat", ".ps1") else ""
        return f"已写入: {path} ({len(content)} 字符){extra}"
    except Exception as e:
        return f"写入失败: {e}"


def dynamic_tool(name: str, args: dict) -> str | None:
    """尝试在工作区 toolshed/ 中查找同名脚本并执行。返回 None 表示未找到。"""
    for ext in (".py", ".bat", ".ps1"):
        script_path = TOOLS_DIR / f"{name}{ext}"
        if not script_path.exists():
            continue
        try:
            if ext == ".py":
                import sys
                cmd_args = [sys.executable, str(script_path)]
            elif ext == ".bat":
                cmd_args = ["cmd.exe", "/c", str(script_path)]
            elif ext == ".ps1":
                cmd_args = ["powershell.exe", "-NoProfile", "-File", str(script_path)]
            else:
                continue

            result = subprocess.run(
                cmd_args,
                input=json.dumps(args),
                capture_output=True, text=True, timeout=30,
                cwd=str(TOOLS_DIR),
            )
            output = result.stdout.strip()
            if result.stderr.strip():
                output += "\n" + result.stderr.strip()
            return output or "(无输出)"
        except subprocess.TimeoutExpired:
            return "脚本执行超时 (30s)"
        except Exception as e:
            return f"脚本执行出错: {e}"
    return None


# ═══════════════════════════════════════════════
# 工具注册表
# ═══════════════════════════════════════════════

class ToolRegistry:
    """工具注册表。管理内置工具 + 动态工具。"""

    def __init__(self):
        self.tools: dict[str, Callable[[dict], str]] = {
            "run_shell":  run_shell,
            "read_file":  read_file,
            "write_file": write_file,
        }

    def get_definitions(self) -> list[dict]:
        """返回 OpenAI function calling 格式的工具定义列表。"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "run_shell",
                    "description": (
                        "执行一个 Shell 命令（Windows PowerShell）。"
                        "用于：启动程序、管理文件、查询系统信息、调用第三方工具等。"
                        "命令在工作区目录下执行。输出字符数限制为 8000。"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "要执行的 Shell 命令",
                            },
                        },
                        "required": ["command"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": (
                        "读取工作区内任意文件的内容。"
                        "用于：查看代码、阅读文档、检查配置文件等。"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "相对于工作区的文件路径，或绝对路径",
                            },
                        },
                        "required": ["path"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": (
                        "在工作区内写入任意类型的文件。"
                        "支持 .py / .bat / .ps1 / .txt / .json / .csv 等。"
                        "写入到 toolshed/ 目录。"
                        "脚本类文件（.py .bat .ps1）写入后自动成为可调用工具"
                        "（工具名 = 文件名去掉后缀）。"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {
                                "type": "string",
                                "description": "文件名，如 'scan.py', 'kill.bat', 'data.json'",
                            },
                            "content": {
                                "type": "string",
                                "description": "完整的文件内容",
                            },
                        },
                        "required": ["filename", "content"],
                    },
                },
            },
        ]

    def execute(self, tool_name: str, args: dict) -> str:
        """执行工具调用。先查内置工具，再查动态工具。"""
        handler = self.tools.get(tool_name)
        if handler:
            return handler(args)

        # 动态工具：在工作区查找同名脚本
        result = dynamic_tool(tool_name, args)
        if result is not None:
            return result

        return f"未知工具: {tool_name}"
