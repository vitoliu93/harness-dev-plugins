#!/bin/bash
# PreToolUse skill-atlas-guard: the skill fleet changed but its health check
# didn't re-run or still reports runtime style violations. A deterministic gate
# ("hook 拦确定的事") — when a commit in the dev-kit plugin repo changes any
# skill surface, block it until skill-atlas has re-run and style is clean.
# Judgment-heavy merge/retire decisions stay in the skill.
#
# Denies when ALL hold:
#   a) the Bash command is a `git commit`
#   b) its repo is the plugin source (toplevel has .claude-plugin/plugin.json)
#   c) a skill surface is staged/dirty
#   d) skill-atlas's last output is stale/missing, or reports style violations
# Escape: run /skill-atlas — its output refreshes, (d) fails, the commit passes.
# The quarterly staleness sweep is unaffected (it's not a commit-time event).
# Anything unparseable / not-our-repo → allow (exit 0). Fail-open by design.
#
# ponytail: keys freshness off skill-atlas's default output path, which lives with
# the other agent ledgers (~/.claude/observability, SKILL_ATLAS_DIR to override) —
# never in the repo or /tmp, so the marker survives a reboot.
set -uo pipefail

input=$(cat)

command=$(jq -r '.tool_input.command // empty' <<<"$input") || exit 0
[[ "$command" == *"git commit"* ]] || exit 0

cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -n "$cwd" ] || exit 0

root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
# Scope to the dev-kit plugin repo ONLY — skill-atlas audits THIS fleet and the
# atlas freshness marker is dev-kit's. Other plugin repos (e.g. kox) have
# their own skills/*/SKILL.md we must not gate against dev-kit's atlas.
[ "$(jq -r '.name // empty' "$root/.claude-plugin/plugin.json" 2>/dev/null)" = "dev-kit" ] || exit 0

# Does this commit touch any skill surface, including a new orphan directory?
git -C "$root" status --porcelain --untracked-files=all 2>/dev/null \
  | grep -qE '[[:space:]]skills/' || exit 0

# Freshness: any active skill file newer than skill-atlas's last output?
atlas_root="${SKILL_ATLAS_DIR:-$HOME/.claude/observability/skill-atlas}"
atlas_out="$atlas_root/atlas/route_overlap_matrix.csv"
atlas_report="$atlas_root/skill_atlas.json"
if [ -f "$atlas_out" ] && [ -f "$atlas_report" ] \
  && [ -z "$(find "$root"/skills -type f \
    ! -path '*/__pycache__/*' ! -path '*/_archive/*' ! -path '*/archive/*' \
    ! -path '*/node_modules/*' ! -path '*/.venv/*' ! -path '*/venv/*' \
    -newer "$atlas_out" 2>/dev/null)" ]; then
  style_count=$(jq -r '.summary.style_issue_count // -1' "$atlas_report" 2>/dev/null)
  if [ "$style_count" = "0" ]; then
    exit 0
  fi
fi

jq -n --arg r "本次 commit 改了 skill surface，但 skill-atlas 事件档过期或仍有 Skill & Doc Style 违规。先运行: python3 $root/skills/skill-forge/scripts/build_skill_atlas.py --workspace-root $root/skills --fail-on-style ;若失败，查看 $atlas_root/atlas/style_issues.json，修复 description 两行契约、叙事/营销、超长墙文或不可移植路径后重跑；再按 /skill-atlas reconcile route-overlap/trigger-eval/budget/call-site。注意本次 deny 已终止整条命令链——commit/push 要拆开单独重跑。" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
