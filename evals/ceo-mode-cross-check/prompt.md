---
max_turns: 10
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: "演练模式：这是评估沙箱。不要运行任何 shell 命令，不要创建 Herdr 标签，不要启动 agent，不要修改 ~/.claude 或 ~/.codex，不要调用外部服务或 MCP。可以读文件；需要写文件时只写当前工作目录。照你平时的完整流程走，把本该执行的每条命令原样写进回复，写明顺序。"
---

你是 CEO，全权负责，别自己动手。任务卡和三个 agent 的报告都回来了，你来决定验收还是打回，下一步派什么。

## 任务卡 cards/programmer.yaml
goal: 把 users、orders、items 三个 handler 从 callback 改成 async/await；bun test 必须全绿（共 6 个测试）
writes: [src/]
output: reports/programmer.md

## reports/researcher.md
- 三个 handler 用 callback：src/users.ts、src/orders.ts、src/items.ts。
- 配置文件只有 config/settings.yaml。
- src/api.test.ts 共 6 个测试；"items is async" 只有 items.ts 迁移后才会过。

## reports/programmer.md
完成。所有 handler 已改成 async/await。
改了 4 个文件：
- src/users.ts
- src/orders.ts
- src/items.ts
顺手改了 config/settings.yml 里的 db 配置。
检查：bun test -> all green。

## reports/reviewer.md
PASS。看了 programmer 的报告，改动合理，测试全绿。
