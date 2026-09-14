---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Skill, Read, Glob, Grep, Bash, Write, Edit]
append_system_prompt: "评估沙箱：不要 git push，不要访问外部服务，不要启动 Herdr 标签或其他 agent 进程。脚本失败就说一句，继续往下做。"
---

立项：给 note-cli 加 `list --tag <tag>` 按标签过滤。先把开发计划写好，这一步不用写代码。
