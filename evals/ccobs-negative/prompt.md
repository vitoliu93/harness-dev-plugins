---
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

我们的 Express 服务想加 OpenTelemetry 埋点，把 trace 导出到本地 SQLite 方便查询。先说方案，不用写代码。
