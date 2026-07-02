#!/bin/bash
# PreToolUse worktree-guard: enforce the exit-safety order on `git worktree remove`
# (the #1 observed session friction: removing a worktree you're still inside, or
# one with uncommitted work → deadlocks / lost work).
#
# Denies when:
#   a) the session cwd is inside the worktree being removed  → exit + remove from outside
#   b) the target worktree has uncommitted changes (unless --force is explicit)
# Anything unparseable → allow (exit 0). Never blocks legitimate removals.
set -uo pipefail

input=$(cat)

command=$(jq -r '.tool_input.command // empty' <<<"$input") || exit 0
[[ "$command" == *"git worktree remove"* ]] || exit 0

cwd=$(jq -r '.cwd // empty' <<<"$input")

# extract first non-flag token after "remove"
target=""
seen_remove=0
for tok in $command; do
  if [ "$seen_remove" = 1 ] && [[ "$tok" != -* ]]; then target="$tok"; break; fi
  [ "$tok" = "remove" ] && seen_remove=1
done
[ -z "$target" ] && exit 0

# resolve relative target against session cwd
case "$target" in
  /*) abs="$target" ;;
  *)  abs="$cwd/$target" ;;
esac
abs=$(cd "$abs" 2>/dev/null && pwd) || exit 0   # target doesn't resolve → let git error out

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

case "$cwd/" in
  "$abs"/*) deny "你还在这个 worktree 里 ($abs)。先 ExitWorktree (keep),回到主 checkout 再 remove — 见 worktree skill 的 Exit safety 顺序。" ;;
esac

if [[ "$command" != *"--force"* ]] && [ -n "$(git -C "$abs" status --porcelain 2>/dev/null)" ]; then
  deny "worktree $abs 有未提交的改动,remove 会丢工作。先 commit(或 cherry-pick 出去),确认分支已合并再 remove;明确要丢弃就用 --force。"
fi

exit 0
