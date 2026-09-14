---
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash]
append_system_prompt: >-
  评估环境限制：每条运行 ccobs 脚本或 sqlite3 的 Bash 命令都在开头加 `export CCOBS_DIR=/tmp/devkit-evals/g4/ccobs-db;`，
  不要读写 ~/.claude/observability，不要运行 install.sh、distill.ts 或 rollup.ts。
---

把 Claude Code 最近的会话记录导进观测库，然后告诉我 agent-plugins 这个项目里调用次数最多的 5 个工具。
