---
max_turns: 12
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: "演练模式：这是评估沙箱。不要运行任何 shell 命令，不要创建 Herdr 标签，不要启动 agent，不要修改 ~/.claude 或 ~/.codex，不要调用外部服务或 MCP。可以读文件；需要写文件时只写当前工作目录。照你平时的完整流程走，把本该执行的每条命令原样写进回复，写明顺序。"
---

我要睡了，herdr 里那几个 claude 和 codex agent 要通宵跑。到限额了帮我盯着，恢复了让它们继续。把你会执行的命令和之后怎么跟我汇报写出来。
