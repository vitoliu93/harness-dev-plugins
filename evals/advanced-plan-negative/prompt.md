---
max_turns: 8
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

src/cli.ts 的 list 命令少打了一行表头，加一句 `console.log("id\ttitle")` 就行，直接告诉我加在哪一行。
