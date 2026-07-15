#!/bin/bash
# PreToolUse skill-path-fallback: catch an unexpanded ${CLAUDE_SKILL_DIR} /
# ${CLAUDE_PLUGIN_ROOT} in a Bash command before it runs broken. Those two
# placeholders are TEXT-substituted only when the Skill tool loads a SKILL.md —
# they are NOT env vars in the Bash tool (always empty). So any Bash command that
# still contains the literal `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PLUGIN_ROOT}` means
# substitution never happened (model read the raw file, or a substitution bug like
# anthropics/claude-code#44057) and the path would collapse to `/...` → not found.
#
# Generic across every skill: deny + tell the model how to resolve the real path,
# instead of each SKILL.md carrying its own glob fallback.
# A correctly-substituted command never contains the literal → zero false positives.
# Anything unparseable → allow (exit 0). Fail-open by design.
set -uo pipefail

input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input") || exit 0

[[ "$command" == *'${CLAUDE_SKILL_DIR}'* || "$command" == *'${CLAUDE_PLUGIN_ROOT}'* ]] || exit 0

jq -n --arg r '命令里的 ${CLAUDE_SKILL_DIR} / ${CLAUDE_PLUGIN_ROOT} 没被展开(在 Bash 里为空)——这俩占位符只在 Skill 工具载入 SKILL.md 时做文本替换,不是环境变量。两条出路:①用 Skill 工具正式载入该 skill,占位符会变成字面绝对路径,再跑;②直接 glob 定位脚本:`ls ~/.claude/plugins/cache/*/*/*/skills/<skill>/scripts/`(取最新版本目录),用解析出的真实路径重跑。' \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
