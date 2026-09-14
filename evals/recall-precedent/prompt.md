---
max_turns: 20
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, Bash]
append_system_prompt: "评估沙箱：不要 git push，不要访问外部服务，不要启动 Herdr 标签或其他 agent 进程。脚本失败就说一句，继续往下做。"
---

开工前先查一下：萤火虫支付回调重试这事，以前的会话里弄过吗？
