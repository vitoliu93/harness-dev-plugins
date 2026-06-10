#!/bin/bash
# PreToolUse guard: lark-* skill usage in the MAIN context gets denied with a
# redirect to the lark-operator subagent. Inside any subagent (agent_id present
# in hook input), lark-* runs freely — that's where the work is supposed to happen.
# Escape hatch: typing /lark-* as a slash command bypasses the Skill tool entirely.
set -euo pipefail

input=$(cat)

# Subagent context — allow
if [ -n "$(jq -r '.agent_id // empty' <<<"$input")" ]; then
  exit 0
fi

tool_name=$(jq -r '.tool_name // empty' <<<"$input")

case "$tool_name" in
  Skill)
    skill=$(jq -r '.tool_input.skill // empty' <<<"$input")
    case "$skill" in
      lark-skill-maker | *:lark-skill-maker) exit 0 ;; # dev-time skill, belongs in main context
      lark-* | *:lark-*) ;;
      *) exit 0 ;;
    esac
    ;;
  Read)
    file_path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    case "$file_path" in
      */skills/lark-skill-maker/*) exit 0 ;;
      */skills/lark-*) ;;
      *) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "飞书/Lark 操作（含查看 lark-* 技能文件）请委派给 lark-operator subagent 执行：Agent 工具，subagent_type \"vito-agent-plugins:lark-operator\"（运行在 sonnet 上）。通知、留档、发消息、建文档等多为任务无关的事后工作，lark-* 技能体和 lark-cli 输出会污染主上下文。在 prompt 里写清楚操作类型、目标对象（人/群/文档链接）和内容来源，它只带回确认信息（链接/ID）或提炼后的内容。"
  }
}'
