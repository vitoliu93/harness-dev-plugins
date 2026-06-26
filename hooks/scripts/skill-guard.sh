#!/bin/bash
# PreToolUse skill-guard: noisy "fire-and-forget" skills must run inside a
# subagent, not inline in the main context. ONE table (DELEGATE) drives
# everything — add a row to delegate a new skill. Inside any subagent
# (agent_id present in hook input) all skills run freely — that's where the
# work is meant to happen. Escape hatch: typing /<skill> as a slash command
# bypasses the Skill tool entirely.
set -euo pipefail

input=$(cat)

# Subagent context — allow everything
[ -n "$(jq -r '.agent_id // empty' <<<"$input")" ] && exit 0

tool_name=$(jq -r '.tool_name // empty' <<<"$input")

# Delegation table — the single source of truth. To delegate a new noisy skill,
# add one row. Format: "skill_glob|target_agent|model|hint"
#   skill_glob   shell glob matched against the base skill name (namespace stripped)
#   target_agent subagent to redirect to (resolved under vito-agent-plugins:)
#   model        推荐 model for the spawn; empty = let the target agent pick its own tier
#   hint         short label for the redirect message
DELEGATE=(
  "exa-code|general-skills-executor|sonnet|Exa 网页搜索与代码查找"
  "html-doc|general-skills-executor|sonnet|HTML 可视化/信息图/架构图"
  "lark-*|general-skills-executor|haiku|飞书操作 通知/留档/日程/读取"
  "ask-ai|ai-second-opinion||AI 第二意见/清洁上下文校审"
)
# Skills that match a glob above but must stay in the main context.
EXEMPT=( "lark-skill-maker" )

is_exempt() {
  local s="$1" e
  for e in "${EXEMPT[@]}"; do [ "$s" = "$e" ] && return 0; done
  return 1
}

deny() {
  local skill="$1" agent="$2" model="$3" hint="$4" model_clause=""
  [ -n "$model" ] && model_clause="，推荐 spawn 时传 model: \"$model\"（复杂/重任务可上调到 opus）"
  jq -n --arg sk "$skill" --arg ag "$agent" --arg mc "$model_clause" --arg hint "$hint" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("\($hint)（\($sk)）请委派给 \($ag) subagent 执行：Agent 工具，subagent_type \"vito-agent-plugins:\($ag)\"\($mc)。在 prompt 里写清楚要用的技能（\($sk)）、操作意图和关键参数；该技能体和中间输出会污染主上下文，subagent 只带回提炼后的结果。")
    }
  }'
}

# Look up a base skill name in the table; on match emit deny and exit.
guard_skill() {
  local base="$1" row pattern agent model hint
  is_exempt "$base" && return 0
  for row in "${DELEGATE[@]}"; do
    IFS='|' read -r pattern agent model hint <<< "$row"
    case "$base" in
      $pattern) deny "$base" "$agent" "$model" "$hint"; exit 0 ;;
    esac
  done
}

case "$tool_name" in
  Skill)
    skill=$(jq -r '.tool_input.skill // empty' <<<"$input")
    guard_skill "${skill##*:}"   # strip plugin namespace prefix
    ;;
  Read)
    file_path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    cwd=$(jq -r '.cwd // empty' <<<"$input")
    # Developing a skill's source inside the current working tree is legitimate
    # — exempt it. Out-of-tree skill files (the global ~/.agents/skills store or
    # the installed plugin cache) stay guarded. Absent cwd → fall through to the
    # strict guard, never open a hole.
    if [ -n "$cwd" ]; then
      case "$file_path" in "$cwd"/*) exit 0 ;; esac
    fi
    # Glob matches both ~/.agents/skills/<name>/... and $PWD/skills/<name>/...
    # and the plugin cache. Nested files (references/*.md) still map to the skill.
    case "$file_path" in
      */skills/*)
        skill_dir="${file_path##*/skills/}"
        skill_dir="${skill_dir%%/*}"
        guard_skill "$skill_dir"
        ;;
    esac
    ;;
esac

# No match — allow
exit 0
