#!/bin/bash
# PreToolUse guard: skills that have companion subagents must be used via the
# Agent tool, not called inline in the main context. Inside any subagent
# (agent_id present in hook input), all skills run freely.
# Escape hatch: typing /<skill> as a slash command bypasses the Skill tool.
set -euo pipefail

input=$(cat)

# Subagent context — allow everything
if [ -n "$(jq -r '.agent_id // empty' <<<"$input")" ]; then
  exit 0
fi

tool_name=$(jq -r '.tool_name // empty' <<<"$input")

# skill_name -> subagent_type mapping
# Format: "skill_pattern:subagent_type:hint_fragment"
# skill_pattern uses shell glob; prefix with plugin namespace optionally.
SKILL_AGENTS=(
  "bilibili-cli:bilibili-researcher:B站/哔哩哔哩搜索与视频摘要"
  "cc-reflection:cc-reflector:协作复盘"
  "ask-ai:ai-second-opinion:AI 第二意见/清洁上下文校审"
  "exa-code:exa-searcher:Exa 网页搜索与代码查找"
  "gemini-media:media-reader:音视频文件理解与转写"
  "html-doc:html-visualizer:HTML 可视化/信息图/架构图"
  "xiaohongshu-cli:xiaohongshu-researcher:小红书搜索与真实测评"
  "youtube-cli:youtube-researcher:YouTube 视频搜索与摘要"
)

deny_with_redirect() {
  local skill_name="$1" subagent="$2" hint="$3"
  jq -n --arg sn "$skill_name" --arg sa "$subagent" --arg hint "$hint" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("\($hint)（\($sn)）请委派给 \($sa) subagent 执行：Agent 工具，subagent_type \"vito-agent-plugins:\($sa)\"。该技能体和中间输出会污染主上下文，subagent 只带回提炼后的结果。在 prompt 里写清楚操作意图和关键参数即可。")
    }
  }'
}

case "$tool_name" in
  Skill)
    skill=$(jq -r '.tool_input.skill // empty' <<<"$input")
    # Strip plugin namespace prefix if present (e.g. "vito-agent-plugins:bilibili-cli" -> "bilibili-cli")
    base_skill="${skill##*:}"

    # lark-* family — handled by dedicated lark-guard.sh; skip here
    case "$base_skill" in
      lark-*) exit 0 ;;
    esac

    for entry in "${SKILL_AGENTS[@]}"; do
      IFS=':' read -r pattern subagent hint <<< "$entry"
      if [ "$base_skill" = "$pattern" ]; then
        deny_with_redirect "$base_skill" "$subagent" "$hint"
        exit 0
      fi
    done
    ;;
  Read)
    file_path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    cwd=$(jq -r '.cwd // empty' <<<"$input")
    # Editing a skill's *source* inside the current working tree (i.e. developing
    # this plugin repo) is legitimate — exempt it. Only out-of-tree skill files
    # (the installed plugin cache during normal usage) stay guarded. If cwd is
    # absent, fall through to the strict guard — never open a hole.
    if [ -n "$cwd" ]; then
      case "$file_path" in
        "$cwd"/*) exit 0 ;;
      esac
    fi
    # Only guard reads of skill definition files under our skills/ directory
    case "$file_path" in
      */skills/lark-*) exit 0 ;; # lark-guard.sh handles this
      */skills/bilibili-cli/*|*/skills/cc-reflection/*|*/skills/ask-ai/*|*/skills/exa-code/*|*/skills/gemini-media/*|*/skills/html-doc/*|*/skills/xiaohongshu-cli/*|*/skills/youtube-cli/*)
        # Extract skill dir name (first path segment after /skills/, so
        # nested files like references/*.md still map to the skill)
        skill_dir="${file_path##*/skills/}"
        skill_dir="${skill_dir%%/*}"
        for entry in "${SKILL_AGENTS[@]}"; do
          IFS=':' read -r pattern subagent hint <<< "$entry"
          if [ "$skill_dir" = "$pattern" ]; then
            deny_with_redirect "$skill_dir" "$subagent" "$hint"
            exit 0
          fi
        done
        ;;
    esac
    ;;
esac

# No match — allow
exit 0
