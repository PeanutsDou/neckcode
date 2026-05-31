# -*- coding: utf-8 -*-
"""Small tool registry for the terminal Neck agent."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Callable


WORKSPACE = Path(__file__).parent.resolve()
TOOLS_DIR = WORKSPACE / "toolshed"
MAX_OUTPUT_CHARS = 8000


def _clip(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n...[truncated {len(text) - limit} chars]"


def _resolve_workspace_path(raw_path: str, *, base: Path = WORKSPACE) -> Path:
    if not raw_path:
        raise ValueError("path is required")
    path = Path(raw_path)
    if not path.is_absolute():
        path = base / path
    path = path.resolve()
    base = base.resolve()
    if path != base and base not in path.parents:
        raise ValueError(f"path escapes workspace: {path}")
    return path


def run_shell(args: dict) -> str:
    command = str(args.get("command", "")).strip()
    if not command:
        return "ERROR: command is required"

    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", command],
            cwd=str(WORKSPACE),
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        return "ERROR: command timed out after 60s"
    except Exception as exc:
        return f"ERROR: command failed: {exc}"

    output = result.stdout.strip()
    error = result.stderr.strip()
    if error:
        output = f"{output}\n{error}".strip()
    if result.returncode != 0:
        output = f"[exit {result.returncode}]\n{output}".strip()
    return _clip(output or "(no output)")


def read_file(args: dict) -> str:
    try:
        path = _resolve_workspace_path(str(args.get("path", "")))
        return _clip(path.read_text(encoding="utf-8", errors="replace"))
    except FileNotFoundError:
        return "ERROR: file not found"
    except Exception as exc:
        return f"ERROR: read_file failed: {exc}"


def write_file(args: dict) -> str:
    filename = str(args.get("filename", "")).strip()
    content = str(args.get("content", ""))
    if not filename:
        return "ERROR: filename is required"

    try:
        path = _resolve_workspace_path(filename, base=TOOLS_DIR)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        extra = ""
        if path.suffix.lower() in {".py", ".bat", ".ps1"}:
            extra = " It can be called as a dynamic tool by filename."
        return f"Wrote {path} ({len(content)} chars).{extra}"
    except Exception as exc:
        return f"ERROR: write_file failed: {exc}"


def _run_dynamic_tool(name: str, args: dict) -> str | None:
    safe_name = Path(name).name
    if safe_name != name:
        return None

    for ext in (".py", ".bat", ".ps1"):
        script = TOOLS_DIR / f"{safe_name}{ext}"
        if not script.exists():
            continue

        if ext == ".py":
            command = [sys.executable, str(script)]
        elif ext == ".bat":
            command = ["cmd.exe", "/c", str(script)]
        else:
            command = ["powershell.exe", "-NoProfile", "-File", str(script)]

        try:
            result = subprocess.run(
                command,
                cwd=str(TOOLS_DIR),
                input=json.dumps(args, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=30,
            )
        except subprocess.TimeoutExpired:
            return "ERROR: dynamic tool timed out after 30s"
        except Exception as exc:
            return f"ERROR: dynamic tool failed: {exc}"

        output = result.stdout.strip()
        error = result.stderr.strip()
        if error:
            output = f"{output}\n{error}".strip()
        if result.returncode != 0:
            output = f"[exit {result.returncode}]\n{output}".strip()
        return _clip(output or "(no output)")

    return None


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Callable[[dict], str]] = {
            "run_shell": run_shell,
            "read_file": read_file,
            "write_file": write_file,
        }

    def definitions(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "run_shell",
                    "description": "Run a PowerShell command in the agent workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {"type": "string", "description": "PowerShell command to run."}
                        },
                        "required": ["command"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": "Read a UTF-8 text file inside the agent workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Workspace-relative file path."}
                        },
                        "required": ["path"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": "Write a file under toolshed/. Script files can be reused as dynamic tools.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string", "description": "Path relative to toolshed/."},
                            "content": {"type": "string", "description": "Full file content."},
                        },
                        "required": ["filename", "content"],
                    },
                },
            },
        ]

    def execute(self, name: str, args: dict) -> str:
        handler = self._tools.get(name)
        if handler:
            return handler(args)

        result = _run_dynamic_tool(name, args)
        if result is not None:
            return result

        return f"ERROR: unknown tool: {name}"
