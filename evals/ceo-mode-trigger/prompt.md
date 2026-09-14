---
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
append_system_prompt: "演练模式：这是评估沙箱。不要运行任何 shell 命令，不要创建 Herdr 标签，不要启动 agent，不要修改 ~/.claude 或 ~/.codex，不要调用外部服务或 MCP。可以读文件；需要写文件时只写当前工作目录。照你平时的完整流程走，把本该执行的每条命令原样写进回复，写明顺序。"
---

你是 CEO，这件事全权交给你：把我们 shop-api 仓库里所有 console.log 换成 pino 结构化日志。别自己动手，全部交给 agent 干，干完只给我结果。

（演练：最后一条回复里贴出你写的每张任务卡全文。）
