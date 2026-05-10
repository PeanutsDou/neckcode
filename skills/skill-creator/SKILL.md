---
name: skill-creator
description: >
  TRIGGER when: creating a new SKILL.md file, editing an existing skill file,
  writing a custom slash command, the user mentions "创建skill" or "create skill"
  or "créer un skill" or "skillを作成", or any scenario involving writing/updating
  a ~/.deepseekcode/skills/**/SKILL.md file.
  SKIP: using an existing skill (call Skill tool instead), general questions
  about what skills are.
  This skill provides guardrails and best practices for authoring skills.
version: 0.1.0
---

# Skill Creator

When the user is about to create or edit a skill (SKILL.md), apply the following
rules before writing any file.

## 1. Skill Storage Location

Skills live in `~/.deepseekcode/skills/<skill-name>/SKILL.md`. Do NOT write to
`~/.claude/skills/` — that is a different application. This agent's home is
`~/.deepseekcode/`, and all skills, memory, and config live under that directory.

Use the Write tool to create skills:
```
Write: ~/.deepseekcode/skills/<name>/SKILL.md
```

## 2. Prefer Built-in Tools Over Shell

Using `Read`, `Write`, `Edit`, `Grep`, `Glob` instead of raw shell commands:
- Avoids permission parsing bugs
- Works cross-platform (Windows/Unix path differences)
- Produces cleaner, more maintainable skill definitions

## 3. Auto-invocation via Description

To make a skill auto-invoke, include `TRIGGER when:` and `SKIP:` clauses in the
`description` frontmatter field. Keep them specific enough to avoid false
positives.

## 4. Frontmatter Requirements

Every skill must have YAML frontmatter with:
- `name:` — matches the directory name
- `description:` — one line summary (and optionally TRIGGER/SKIP clauses)
- `version:` — semver, bump on changes

## 5. Directory Layout

```
~/.deepseekcode/skills/<skill-name>/SKILL.md
```

The skill must be a single `SKILL.md` file inside a directory named after the skill.
No other files are required in that directory.
