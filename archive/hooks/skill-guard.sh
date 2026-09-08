#!/bin/bash
# PreToolUse skill-guard: noisy "fire-and-forget" skills must run inside a
# separate agent, not inline in the main context. ONE table (DELEGATE) drives
# everything — add a row to delegate a new skill. The guard names no fixed
# target: the main model picks one via the use-agents skill (external CLI agent
# or any subagent). Inside any subagent (agent_id present in hook input) all
# skills run freely — that's where the work is meant to happen. External agents
# (cursor-agent, codex) are separate processes and never reach this hook.
# Escape hatch: typing /<skill> as a slash command bypasses the Skill tool.
set -euo pipefail

input=$(cat)

# Subagent context — allow everything
[ -n "$(jq -r '.agent_id // empty' <<<"$input")" ] && exit 0

tool_name=$(jq -r '.tool_name // empty' <<<"$input")

# Delegation table — the single source of truth. To delegate a new noisy skill,
# add one row. Format: "skill_glob|hint|extra"
#   skill_glob   shell glob matched against the base skill name (namespace stripped)
#   hint         short label for the redirect message
#   extra        optional clause appended to the redirect message (e.g. hard rules)
DELEGATE=(
  "exa-code|Exa 网页搜索与代码查找|"
  "use-html|HTML 可视化/信息图/架构图|"
  "lark-*|飞书操作 通知/留档/日程/读取|硬规则：涉及内容创作（OKR 措辞、文档正文、评论文案等核心交付）时，主模型必须先拟好最终全文、逐字放进 prompt，执行方只调 API、不得代拟内容——判断密集的部分不外包。"
  "media-understanding|音视频文件 Gemini 转写理解|"
)
# Skills that match a glob above but must stay in the main context.
# lark-im is outbound messaging (a send/write) — the "写操作不下放" rule keeps it
# in the main session for reviewable authorization, so it can't be delegated.
EXEMPT=( "lark-skill-maker" "lark-im" )

is_exempt() {
  local s="$1" e
  for e in "${EXEMPT[@]}"; do [ "$s" = "$e" ] && return 0; done
  return 1
}

# The one dispatch sentence — kept byte-identical with kox-agent-plugins'
# kox-agent-guard.sh so both plugins say the same thing.
DISPATCH='派给独立 agent 执行：按 use-agents 技能挑一个外部 agent（composer / grok / codex）或任意 subagent，prompt 写清技能名、意图和关键参数，只带回结论。'

deny() {
  local skill="$1" hint="$2" extra="$3"
  jq -n --arg sk "$skill" --arg hint "$hint" --arg extra "$extra" --arg d "$DISPATCH" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("\($hint)（\($sk)）的技能体和原始输出会污染主上下文，主上下文不执行。\($d)" + $extra)
    }
  }'
}

# Look up a base skill name in the table; on match emit deny and exit.
guard_skill() {
  local base="$1" row pattern hint extra
  is_exempt "$base" && return 0
  for row in "${DELEGATE[@]}"; do
    IFS='|' read -r pattern hint extra <<< "$row"
    case "$base" in
      $pattern) deny "$base" "$hint" "$extra"; exit 0 ;;
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
