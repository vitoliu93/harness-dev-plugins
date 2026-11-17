---
max_turns: 4
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

我们调用 Claude API 的批处理脚本老被 429 rate limit 打回来，脚本跑一晚上就断。怎么加指数退避重试？给个 TypeScript 示例。
