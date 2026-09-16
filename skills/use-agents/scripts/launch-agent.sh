#!/usr/bin/env bash
# launch-agent.sh <name> <kind> <label> <prompt-file> [-- <native-agent-args>]
#
# The three-step Herdr launch from references/herdr.md, with its checks:
#   tab create → (3s) → agent start → agent get (retry once) → prompt + Enter → status.
# Prints one JSON line {agent_name, tab_id, pane_id, agent_status}. Exit 2 = agent never registered.
# Sentinel is separate: scripts/wait-result.sh <name> <result-file> <marker> [timeout].
set -euo pipefail
[ $# -ge 4 ] || { echo "usage: launch-agent.sh <name> <kind> <label> <prompt-file> [-- <native-agent-args>]" >&2; exit 1; }
name=$1; kind=$2; label=$3; prompt_file=$4; shift 4
[ "${1:-}" = "--" ] && shift
[ -f "$prompt_file" ] || { echo "prompt file not found: $prompt_file" >&2; exit 1; }
command -v herdr >/dev/null || { echo 'Herdr is unavailable' >&2; exit 1; }

ws=(); [ -n "${HERDR_WORKSPACE_ID:-}" ] && ws=(--workspace "$HERDR_WORKSPACE_ID")
tab_json=$(herdr tab create "${ws[@]}" --cwd "$PWD" --label "$label" --no-focus)
pane=$(printf '%s' "$tab_json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
tab=$(printf '%s' "$tab_json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["tab"]["tab_id"])')
sleep 3   # start in the same second as tab create can register nothing (herdr.md)

for _ in 1 2; do
  herdr agent start "$name" --kind "$kind" --pane "$pane" -- "$@" >/dev/null 2>&1 || true
  sleep 4
  herdr agent get "$name" >/dev/null 2>&1 && break
done
herdr agent get "$name" >/dev/null 2>&1 || { echo "agent $name not registered on pane $pane (tab $tab)" >&2; exit 2; }

herdr agent prompt "$name" "$(cat "$prompt_file")" >/dev/null
herdr agent send-keys "$name" Enter >/dev/null
sleep 5
status=$(herdr agent get "$name" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["agent"]["agent_status"])')
printf '{"agent_name":"%s","tab_id":"%s","pane_id":"%s","agent_status":"%s"}\n' "$name" "$tab" "$pane" "$status"
