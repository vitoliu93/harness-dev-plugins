---
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
append_system_prompt: "演练模式：这是评估沙箱。不要运行任何 shell 命令，不要创建 Herdr 标签，不要启动 agent，不要修改 ~/.claude 或 ~/.codex，不要调用外部服务或 MCP。可以读文件；需要写文件时只写当前工作目录。照你平时的完整流程走，把本该执行的每条命令原样写进回复，写明顺序。 团队文件夹不存在时，把本该复制的目标路径写进回复，不要真的写到 home 目录。"
---

给订单导出接口加分页：researcher 先查现有导出代码和调用方，programmer 改接口，reviewer 最后验收。帮我把这几个角色编排起来，所有角色卡写进当前目录的 cards.md，一个角色一节。
