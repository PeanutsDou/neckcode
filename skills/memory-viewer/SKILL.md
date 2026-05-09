---
name: memory-viewer
description: This skill should be used when the user mentions "memory", "记忆", "MEMORY.md", "查看记忆", or asks to see what Claude remembers about them. It reads and displays the memory index or specific memory entries from ~/.claude/memory/.
version: 0.1.1
---

# Memory Viewer

When the user asks about your memory or wants to see what you remember, read and display the memory contents directly in chat.

## Show Memory Index

First, read the memory index file using the Read tool:

```
Read: ~/.claude/memory/MEMORY.md
```

If MEMORY.md does not exist, tell the user there are no memories saved yet.

After showing the index, tell the user they can ask about a specific memory for more details.

## Show Specific Memory

If the user asks about a specific topic, search for matching memory files with Grep, then read each one:

```
Grep: pattern="<search-term>" path="~/.claude/memory/" glob="*.md"
```

Exclude MEMORY.md from results. Then read each matching file with Read and display its content.
