---
max_turns: 15
timeout_seconds: 500
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: "演练模式：这是评估沙箱。不要运行任何 shell 命令，不要创建 Herdr 标签，不要启动 agent，不要修改 ~/.claude 或 ~/.codex，不要调用外部服务或 MCP。可以读文件；需要写文件时只写当前工作目录。照你平时的完整流程走，把本该执行的每条命令原样写进回复，写明顺序。本机环境变量：CCOBS_DIR=./observability（相对当前工作目录）。"
---

用 herdr 开一个独立的 codex agent，让它查一下 bun test 为什么这么慢。把完整启动步骤和命令给我。
