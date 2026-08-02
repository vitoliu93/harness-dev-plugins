#!/bin/bash
# PreToolUse skill-atlas-guard: the skill fleet changed but its health check
# didn't re-run. A deterministic gate ("hook 拦确定的事") — when a commit in the
# dev-kit plugin repo stages a SKILL.md edit/add, block it until skill-atlas has
# re-run, so stale route-overlap / trigger / budget / call-site findings can't
# ship. The judgment (interpret findings, propose merge/retire) stays in the
# skill; this hook only enforces "did the event check fire at all".
#
# Denies when ALL hold:
#   a) the Bash command is a `git commit`
#   b) its repo is the plugin source (toplevel has .claude-plugin/plugin.json)
#   c) a skills/*/SKILL.md is staged/dirty
#   d) skill-atlas's last output is older than that SKILL.md (or missing)
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

# Does this commit touch the fleet? (staged or working-tree SKILL.md)
git -C "$root" status --porcelain 2>/dev/null | grep -qE 'skills/[^/]+/SKILL\.md' || exit 0

# Freshness: any SKILL.md newer than skill-atlas's last route-overlap output?
atlas_out="${SKILL_ATLAS_DIR:-$HOME/.claude/observability/skill-atlas}/atlas/route_overlap_matrix.csv"
if [ -f "$atlas_out" ] && [ -z "$(find "$root"/skills/*/SKILL.md -newer "$atlas_out" 2>/dev/null)" ]; then
  exit 0   # atlas ran after the latest SKILL.md change → fresh → allow
fi

jq -n --arg r "本次 commit 改了 skills/*/SKILL.md,但 skill-atlas 事件档没重跑——route-overlap/trigger-eval/budget/call-site 可能过期。刷新命令(可直接复制): python3 $root/skills/skill-forge/scripts/build_skill_atlas.py --workspace-root $root/skills ;跑完按 /skill-atlas 的检查清单 reconcile 发现(有 evals/ 的 skill 补跑 trigger_eval),再重新 commit。注意本次 deny 已终止整条命令链——commit/push 要拆开单独重跑,别假设后半段执行过。(季度 staleness 体检不走这条,不受影响。)" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
