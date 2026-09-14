---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
append_system_prompt: >-
  评估环境限制：只在当前工作目录内新建或修改文件，不要改插件仓库或 ~/.claude，不要 git commit/push，不要改 plugin.json 版本号。
  不要运行 style_review.ts（它会调用外部模型），需要时写明“语义检查未运行”。
---

在当前目录的 my-skills/ 下帮我新建一个技能 changelog-writer：根据 git log 生成中文 CHANGELOG 草稿。这个流程我已经在三个会话里手动做过了，想固定下来让模型自己触发。
