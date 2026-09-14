---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

这个小改动你自己直接做就行，不用开 agent：src/utils/date.ts 里的 formatDate 加一个 timeZone 参数，默认 'Asia/Shanghai'。先告诉我你打算怎么改。
