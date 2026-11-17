---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Bash]
append_system_prompt: >-
  评估环境限制：每条 Bash 命令开头加 `export SKILL_ATLAS_DIR=/tmp/devkit-evals/g4/atlas;`。不要修改任何文件，
  不要运行 style_review.ts（它会调用外部模型），语义检查一栏记为 not run。
---

发版前帮我给 dev-kit 插件的技能集合做一次整体体检，出一份报告。
