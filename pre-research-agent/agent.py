# -*- coding: utf-8 -*-
"""Neck terminal agent.

This is intentionally small: one terminal loop, one LLM client, one tool
registry. Keep it readable before making it powerful.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib import error, request

from tools import WORKSPACE, ToolRegistry


API_URL = os.getenv("NECK_API_URL", "https://api.deepseek.com/v1/chat/completions")
API_KEY = os.getenv("NECK_API_KEY") or os.getenv("DEEPSEEK_API_KEY", "")
MODEL = os.getenv("NECK_MODEL", "deepseek-v4-pro")
MAX_TOOL_STEPS = int(os.getenv("NECK_MAX_TOOL_STEPS", "80"))


SYSTEM_PROMPT = f"""你是 Neck，一个运行在终端里的 AI Agent。

工作区：{WORKSPACE}

你可以使用工具读取文件、写入工具脚本、执行 PowerShell 命令。
优先用简单直接的方式解决问题。需要探查时先读取文件或运行查询命令。
回答保持简洁，使用中文。
"""


@dataclass
class StreamResult:
    content: str
    tool_calls: list[dict]
    reasoning_seen: bool = False


def _tool_call_shell() -> dict:
    return {
        "id": "",
        "type": "function",
        "function": {"name": "", "arguments": ""},
    }


class LlmClient:
    def __init__(self, api_url: str, api_key: str, model: str, tools: list[dict]) -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.model = model
        self.tools = tools

    def stream_chat(self, messages: list[dict]) -> StreamResult:
        if not self.api_key:
            raise RuntimeError("Missing API key. Set NECK_API_KEY or DEEPSEEK_API_KEY.")

        payload = {
            "model": self.model,
            "messages": messages,
            "tools": self.tools,
            "stream": True,
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            self.api_url,
            body,
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )

        content = ""
        tool_calls: list[dict] = []
        reasoning_seen = False

        try:
            with request.urlopen(req, timeout=120) as resp:
                for raw_line in resp:
                    line = raw_line.decode("utf-8", errors="replace").strip()
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
                    if delta.get("reasoning_content"):
                        reasoning_seen = True

                    text = delta.get("content") or ""
                    if text:
                        content += text
                        print(text, end="", flush=True)

                    for item in delta.get("tool_calls") or []:
                        index = int(item.get("index", 0))
                        while len(tool_calls) <= index:
                            tool_calls.append(_tool_call_shell())

                        current = tool_calls[index]
                        if item.get("id"):
                            current["id"] = item["id"]
                        fn = item.get("function") or {}
                        if fn.get("name"):
                            current["function"]["name"] += fn["name"]
                        if fn.get("arguments"):
                            current["function"]["arguments"] += fn["arguments"]

        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise RuntimeError(f"API error {exc.code}: {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"API request failed: {exc}") from exc

        return StreamResult(content=content, tool_calls=tool_calls, reasoning_seen=reasoning_seen)


class Agent:
    def __init__(self) -> None:
        self.tools = ToolRegistry()
        self.client = LlmClient(API_URL, API_KEY, MODEL, self.tools.definitions())
        self.messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    def run_turn(self, user_input: str) -> None:
        self.messages.append({"role": "user", "content": user_input})

        for step in range(1, MAX_TOOL_STEPS + 1):
            result = self.client.stream_chat(self.messages)

            if not result.tool_calls:
                print()
                self.messages.append({"role": "assistant", "content": result.content or ""})
                return

            print()
            assistant_msg: dict = {"role": "assistant", "content": result.content or None}
            assistant_msg["tool_calls"] = result.tool_calls
            self.messages.append(assistant_msg)

            for call in result.tool_calls:
                tool_result = self._execute_tool_call(call)
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id", ""),
                        "content": tool_result,
                    }
                )

        print(f"\n[Stopped: reached max tool steps ({MAX_TOOL_STEPS})]")

    def _execute_tool_call(self, call: dict) -> str:
        fn = call.get("function") or {}
        name = str(fn.get("name") or "")
        raw_args = str(fn.get("arguments") or "{}")

        try:
            args = json.loads(raw_args) if raw_args.strip() else {}
        except json.JSONDecodeError as exc:
            return f"ERROR: invalid JSON arguments: {exc}"

        preview = json.dumps(args, ensure_ascii=False)
        if len(preview) > 120:
            preview = preview[:120] + "..."
        print(f"  -> {name}({preview})", flush=True)

        result = self.tools.execute(name, args)
        print("  <- done", flush=True)
        return result

    def run(self) -> None:
        print("Neck Agent")
        print(f"Workspace: {Path(WORKSPACE)}")
        print(f"Model: {MODEL}")
        print("Type /exit to quit.\n")

        while True:
            try:
                user_input = input(">>> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nbye")
                return

            if not user_input:
                continue
            if user_input.lower() == "/exit":
                print("bye")
                return

            try:
                self.run_turn(user_input)
            except Exception as exc:
                print(f"\n[ERROR] {exc}")
            print()


if __name__ == "__main__":
    Agent().run()
