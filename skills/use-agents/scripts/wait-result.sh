#!/usr/bin/env bash
# Wait for an agent's result file. Run with run_in_background.
# usage: wait-result.sh <agent-name> <result-file> <done-marker> [timeout-sec] [progress-file] [stall-seconds]
# exit 0 ready · 2 stuck · 3 idle · 4 timeout · 5 stalled
set -u
SECONDS=0
name=$1; file=$2; marker=$3; limit=${4:-3000}
progress_file=${5:-}
stall_limit=${6:-${WAIT_RESULT_STALL_LIMIT:-600}}
interval=${WAIT_RESULT_INTERVAL:-40}

get_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || python3 -c 'import os,sys;print(int(os.path.getmtime(sys.argv[1])))' "$1" 2>/dev/null
}

end=$((SECONDS+limit)); quiet=0; mtime_warned=0
while [ $SECONDS -lt $end ]; do
  sleep "$interval"
  if [ -f "$file" ]; then
    last_line=$(grep -v '^[[:space:]]*$' "$file" 2>/dev/null | tail -n 1 | tr -d '\r')
    trimmed_line=$(echo "$last_line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    if [ "$last_line" = "$marker" ] || [ "$trimmed_line" = "$marker" ]; then
      echo "RESULT: $file has $marker"
      exit 0
    fi
  fi
  if [ -n "$progress_file" ] && [ "$SECONDS" -ge "$stall_limit" ]; then
    if [ ! -f "$progress_file" ]; then
      echo "STALLED: progress file missing after ${SECONDS}s: $progress_file" >&2
      exit 5
    fi
    mtime=$(get_mtime "$progress_file")
    if [ -n "$mtime" ]; then
      now=$(date +%s)
      age=$((now - mtime))
      [ "$age" -lt 0 ] && age=0
      if [ "$age" -ge "$stall_limit" ]; then
        echo "STALLED: progress not updated for ${age}s (limit ${stall_limit}s)" >&2
        tail -n 1 "$progress_file" >&2
        exit 5
      fi
    elif [ "$mtime_warned" -eq 0 ]; then
      echo "WARN: failed to inspect mtime for $progress_file" >&2
      mtime_warned=1
    fi
  fi
  tail=$(herdr agent read "$name" --lines 6 2>/dev/null)
  st=$(herdr agent get "$name" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["agent"]["agent_status"])' 2>/dev/null)
  echo "$tail" | grep -qE "Interrupted|Do you want to proceed|\(y/n\)|API Error: Connection lost" && { echo "STUCK: prompt/permission box/connection lost"; echo "$tail"; exit 2; }
  [ "$st" = "blocked" ] && { echo "STUCK: blocked"; echo "$tail"; exit 2; }
  # idle with a background shell still running is working, not stopped
  if { [ "$st" = "idle" ] || [ "$st" = "done" ]; } && ! echo "$tail" | grep -qE '[0-9]+ shells?( still running)?'; then quiet=$((quiet+1)); else quiet=0; fi
  [ $quiet -ge 3 ] && { echo "IDLE without result"; herdr agent read "$name" --lines 20 2>/dev/null; exit 3; }
done
echo TIMEOUT; exit 4
