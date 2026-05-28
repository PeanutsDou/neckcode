# -*- coding: utf-8 -*-
"""
Neck — Python AI Agent 终端
================================
一个极简的 AI Agent 运行时。内置三个工具：写脚本、执行 Shell、读文件。
Agent 可以组合这些工具完成任意任务。

工作流程：
  用户提问 → LLM 流式回复 → 如有 tool_call → 执行工具 → 继续循环
  工具执行后，结果自动回传给 LLM，LLM 可以继续调用工具或给出最终回答。

架构：
  Agent.turn()        — 用户输入 → 流式回复 → 工具执行 → turn_continue()
  Agent.turn_continue()— 工具结果 → 继续流式 → 可能再来一轮工具
  Agent.call_api_stream() — 调用 DeepSeek API，逐 token 打印

内置工具：
  - run_shell:     执行任意 Shell 命令（PowerShell）
  - read_file:     读取工作区内任意文件内容
  - write_file:    写任意类型文件到工作区（.py .bat .ps1 .txt .json 等），脚本类写完后自动成为可调用工具
"""

import json
import os
import sys
from pathlib import Path
from urllib import request, error

# ═══════════════════════════════════════════════
# 配置
# ═══════════════════════════════════════════════
API_KEY   = "sk-fe2779230ca44d54ae075fc8d7eb9e36"
API_URL   = "https://api.deepseek.com/v1/chat/completions"
MODEL     = "deepseek-v4-flash"
WORKSPACE = Path(__file__).resolve().parent

# ═══════════════════════════════════════════════
# 工具定义（注册给 LLM 的 tool schema）
# ═══════════════════════════════════════════════
TOOLS = [{
    "type": "function",
    "function": {
        "name": "run_shell",
        "description": "执行一个 Shell 命令（Windows PowerShell）。用于：启动程序、管理文件、查询系统信息、调用第三方工具等。命令在工作区目录下执行。输出字符数限制为 8000。",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "要执行的 Shell 命令"},
            },
            "required": ["command"],
        },
    },
}, {
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "读取工作区内任意文件的内容。用于：查看代码、阅读文档、检查配置文件等。",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "相对于工作区的文件路径，或绝对路径"},
            },
            "required": ["path"],
        },
    },
}, {
    "type": "function",
    "function": {
        "name": "write_file",
        "description": (
            "在工作区内写入任意类型的文件。"
            "支持 .py / .bat / .ps1 / .txt / .json / .csv 等。"
            "写入后，脚本类文件（.py .bat .ps1）自动成为可调用工具（工具名 = 文件名去掉后缀）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {"type": "string", "description": "文件名，如 'scan.py', 'kill.bat', 'data.json'"},
                "content":  {"type": "string", "description": "完整的文件内容"},
            },
            "required": ["filename", "content"],
        },
    },
}]

# ═══════════════════════════════════════════════
# 系统提示词
# ═══════════════════════════════════════════════
SYSTEM_PROMPT = f"""你是 Neck，一个运行在终端里的 AI Agent。你的工作区是 `{WORKSPACE}`。

## 你的工具
- `run_shell`：执行任意 PowerShell 命令。用于启动程序、管理文件、查系统信息、调第三方工具等。
- `read_file`：读取文件内容。用于查看代码、读文档、查配置等。
- `write_file`：在工作区写入任意类型的文件。脚本类（.py .bat .ps1）写入后自动成为可调用工具。

## 工作方式
你的目标不是炫技，而是**高效完成用户需求**。
- 能用一条 shell 命令解决的事，就直接 run_shell。
- 需要先了解情况时，先用 read_file 或 run_shell 探查。
- 复杂任务才写 Python 脚本，分步骤完成。
- 遇到错误自己分析原因，换种方式重试，不要放弃。

## 行为规范
- 回复简洁，用中文。
- 执行命令时简要说明在做什么。
- 如果用户说 `/exit`，回复"再见"后结束。"""


class Agent:
    """Neck Agent 运行时。管理对话历史、工具执行、API 调用。"""

    def __init__(self):
        self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # ─── API 调用（流式）─────────────────────────────

    def call_api_stream(self):
        """
        调用 DeepSeek API，流式 yield 文本增量。
        同时收集 reasoning_content 和 tool_calls，存入 self。
        """
        body = json.dumps({
            "model": MODEL,
            "messages": self.messages,
            "tools": TOOLS,
            "stream": True,
        }).encode("utf-8")

        req = request.Request(API_URL, body, {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        })

        full_content = ""   # 累积的完整回复文本
        tool_calls = []     # 累积的工具调用
        reasoning = ""      # 累积的思考内容（thinking mode）
        reasoning_ended = False  # 思考阶段是否已结束

        try:
            with request.urlopen(req, timeout=120) as resp:
                for line in resp:
                    line = line.decode("utf-8").strip()
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    delta = chunk.get("choices", [{}])[0].get("delta", {})

                    # ── 思考内容：灰色流式打印 ──
                    rc = delta.get("reasoning_content", "")
                    if rc:
                        reasoning += rc
                        print(f"\033[90m{rc}\033[0m", end="", flush=True)

                    # ── 回复文本：先判断是否需要换行分隔 ──
                    content = delta.get("content", "")
                    if content:
                        # 思考结束后、回复开始前，插入一个换行
                        if reasoning and not reasoning_ended:
                            print()
                            reasoning_ended = True
                        full_content += content
                        yield content

                    # ── 工具调用：逐片段拼接 ──
                    tc_delta = delta.get("tool_calls")
                    if tc_delta:
                        for tc in tc_delta:
                            idx = tc.get("index", 0)
                            while len(tool_calls) <= idx:
                                tool_calls.append({
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                })
                            if "id" in tc:
                                tool_calls[idx]["id"] = tc["id"]
                            if "function" in tc:
                                if "name" in tc["function"]:
                                    tool_calls[idx]["function"]["name"] += tc["function"]["name"]
                                if "arguments" in tc["function"]:
                                    tool_calls[idx]["function"]["arguments"] += tc["function"]["arguments"]

        except error.HTTPError as e:
            yield f"\n[API 错误: {e.read().decode('utf-8', errors='replace')[:300]}]\n"
        except Exception as e:
            yield f"\n[错误: {e}]\n"

        # 保存完整结果供 turn() 使用
        self._stream_full_content = full_content
        self._stream_tool_calls = tool_calls
        self._stream_reasoning = reasoning

    # ─── 工具执行 ──────────────────────────────────

    def execute_tool(self, name: str, args: dict) -> str:
        """
        执行工具调用。
        - run_shell:  执行 PowerShell 命令
        - read_file:  读取文件内容
        - write_file: 写入任意文件到工作区
        - 其他:       在工作区查找同名脚本并执行 (.py .bat .ps1)
        """
        if name == "run_shell":
            import subprocess
            command = args.get("command", "")
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

        if name == "read_file":
            raw_path = args.get("path", "")
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

        if name == "write_file":
            fname = os.path.basename(args.get("filename", "untitled.txt"))
            path = WORKSPACE / fname
            path.write_text(args.get("content", ""), encoding="utf-8")
            ext = path.suffix
            extra = " → 下次可直接调用" if ext in (".py", ".bat", ".ps1") else ""
            return f"已写入: {path} ({len(args.get('content',''))} 字符){extra}"

        # 动态工具：查找并执行工作区内的脚本
        for ext in (".py", ".bat", ".ps1"):
            script_path = WORKSPACE / f"{name}{ext}"
            if script_path.exists():
                try:
                    import subprocess
                    if ext == ".py":
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
                        cwd=str(WORKSPACE),
                    )
                    output = result.stdout.strip()
                    if result.stderr.strip():
                        output += "\n" + result.stderr.strip()
                    return output or "(无输出)"
                except subprocess.TimeoutExpired:
                    return "脚本执行超时 (30s)"
                except Exception as e:
                    return f"脚本执行出错: {e}"

        return f"未知工具: {name}"

    # ─── 辅助：构建 assistant 消息 ─────────────────

    def _make_assistant_msg(self, content: str, tool_calls: list) -> dict:
        """构建 assistant 消息，如有 reasoning_content 则附带。"""
        msg: dict = {"role": "assistant", "content": content or None}
        if tool_calls:
            msg["tool_calls"] = tool_calls
        if self._stream_reasoning:
            msg["reasoning_content"] = self._stream_reasoning
        return msg

    # ─── 对话回合 ──────────────────────────────────

    def turn(self, user_input: str):
        """
        处理一轮用户输入。
        流程：流式回复 → 如果有工具调用 → 执行 → turn_continue()
        """
        self.messages.append({"role": "user", "content": user_input})

        # 流式输出 LLM 回复
        self._stream_full_content = ""
        self._stream_tool_calls = []
        self._stream_reasoning = ""
        for text in self.call_api_stream():
            print(text, end="", flush=True)

        content = self._stream_full_content
        tool_calls = self._stream_tool_calls

        if tool_calls:
            # 思考模式下，工具调用前已经换过行了，这里加一个换行即可
            if self._stream_reasoning:
                print()

            self.messages.append(self._make_assistant_msg(content, tool_calls))

            # 逐个执行工具
            for tc in tool_calls:
                fn = tc["function"]
                name = fn["name"]
                try:
                    fn_args = json.loads(fn["arguments"]) if fn["arguments"].strip() else {}
                except json.JSONDecodeError:
                    fn_args = {}
                args_preview = json.dumps(fn_args, ensure_ascii=False)[:100]
                print(f"  🔧 {name}({args_preview})", end=" ", flush=True)
                result = self.execute_tool(name, fn_args)
                print("✓")
                self.messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

            self.turn_continue()
        else:
            print()
            self.messages.append(self._make_assistant_msg(content, []))

    def turn_continue(self):
        """
        工具执行后继续对话。
        把工具结果发给 LLM，LLM 可能会继续回复或调用更多工具。
        """
        self._stream_full_content = ""
        self._stream_tool_calls = []
        self._stream_reasoning = ""
        for text in self.call_api_stream():
            print(text, end="", flush=True)

        content = self._stream_full_content
        tool_calls = self._stream_tool_calls

        if tool_calls:
            if self._stream_reasoning:
                print()
            self.messages.append(self._make_assistant_msg(content, tool_calls))

            for tc in tool_calls:
                fn = tc["function"]
                name = fn["name"]
                try:
                    fn_args = json.loads(fn["arguments"]) if fn["arguments"].strip() else {}
                except json.JSONDecodeError:
                    fn_args = {}
                args_preview = json.dumps(fn_args, ensure_ascii=False)[:100]
                print(f"  🔧 {name}({args_preview})", end=" ", flush=True)
                result = self.execute_tool(name, fn_args)
                print("✓")
                self.messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })
            self.turn_continue()
        else:
            print()
            self.messages.append(self._make_assistant_msg(content, []))

    # ─── 主循环 ────────────────────────────────────

    def run(self):
        """启动对话循环。"""
        print(f"Neck Agent")
        print(f"工作区: {WORKSPACE}")
        print(f"模型: {MODEL}")
        print(f"输入 /exit 退出\n")

        while True:
            try:
                user_input = input(">>> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n再见。")
                break

            if not user_input:
                continue
            if user_input.lower() == "/exit":
                print("再见。")
                break

            print()
            try:
                self.turn(user_input)
            except Exception as e:
                print(f"\n[出错: {e}]\n")
            print()


# ═══════════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════════
if __name__ == "__main__":
    Agent().run()
