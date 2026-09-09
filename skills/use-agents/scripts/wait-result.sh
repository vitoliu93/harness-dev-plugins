#!/usr/bin/env bash
# Wait for an agent's result file. Run with run_in_background.
# usage: wait-result.sh <agent-name> <result-file> <done-marker> [timeout-sec]
# exit 0 result ready · 2 stuck (permission box / interrupted / blocked) · 3 idle without result · 4 timeout
set -u
name=$1; file=$2; marker=$3; limit=${4:-3000}
end=$((SECONDS+limit)); quiet=0
while [ $SECONDS -lt $end ]; do
  sleep 40
  grep -q "$marker" "$file" 2>/dev/null && { echo "RESULT: $file has $marker"; exit 0; }
  tail=$(herdr agent read "$name" --lines 6 2>/dev/null)
  st=$(herdr agent get "$name" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["agent"]["agent_status"])' 2>/dev/null)
  echo "$tail" | grep -qE "Interrupted|Do you want to proceed|\(y/n\)" && { echo "STUCK: prompt/permission box"; echo "$tail"; exit 2; }
  [ "$st" = "blocked" ] && { echo "STUCK: blocked"; echo "$tail"; exit 2; }
  if [ "$st" = "idle" ] || [ "$st" = "done" ]; then quiet=$((quiet+1)); else quiet=0; fi
  [ $quiet -ge 3 ] && { echo "IDLE without result"; echo "$tail"; exit 3; }
done
echo TIMEOUT; exit 4
