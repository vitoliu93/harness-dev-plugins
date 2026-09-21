#!/usr/bin/env bash
# Wait for an agent's result file. Run with run_in_background.
# usage: wait-result.sh <agent-name> <result-file> <done-marker> [timeout-sec] [progress-file] [stall-seconds]
# exit 0 ready · 2 stuck · 3 idle · 4 timeout · 5 stalled
set -u
SECONDS=0

usage() { sed -n '2,5p' "$0" >&2; exit 64; }
[ $# -ge 3 ] || { echo "need at least 3 args: <agent-name> <result-file> <done-marker>" >&2; usage; }
# 最常见的用错是漏掉 agent-name，把 <file> <marker> <timeout> 直接往上怼：
# 那样 file 拿到的是标记串、marker 拿到的是超时秒数，[ -f "$file" ] 永远假，
# 脚本从头到尾没在看结果文件，只靠 idle 判定提前退出，看起来像「哨兵误退」。
case "$1$2" in
  */*) : ;;                                   # 至少有一个像路径，继续下面的逐项检查
  *) echo "neither arg looks like a path; did you forget <agent-name>?" >&2; usage ;;
esac
case "$2" in
  */*) : ;;
  *) echo "arg2 must be the result FILE path, got: $2 (did you forget <agent-name>?)" >&2; usage ;;
esac
case "$1" in
  */*) echo "arg1 must be the AGENT NAME, got a path: $1 (did you forget <agent-name>?)" >&2; usage ;;
esac

name=$1; file=$2; marker=$3; limit=${4:-3000}
progress_file=${5:-}
stall_limit=${6:-${WAIT_RESULT_STALL_LIMIT:-600}}
interval=${WAIT_RESULT_INTERVAL:-40}

get_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || python3 -c 'import os,sys;print(int(os.path.getmtime(sys.argv[1])))' "$1" 2>/dev/null
}

# 上一轮留下的同名结果文件里往往还有旧的结束标记，直接匹配会当场误退。
# 记下开工时的 mtime，只认此后被改写过的文件。
base_mtime=0
[ -f "$file" ] && base_mtime=$(get_mtime "$file")
: "${base_mtime:=0}"
fresh_window=${WAIT_RESULT_FRESH_WINDOW:-180}

end=$((SECONDS+limit)); quiet=0; mtime_warned=0; stale_warned=0
while [ $SECONDS -lt $end ]; do
  sleep "$interval"
  if [ -f "$file" ]; then
    last_line=$(grep -v '^[[:space:]]*$' "$file" 2>/dev/null | tail -n 1 | tr -d '\r')
    trimmed_line=$(echo "$last_line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    if [ "$last_line" = "$marker" ] || [ "$trimmed_line" = "$marker" ]; then
      cur_mtime=$(get_mtime "$file"); : "${cur_mtime:=0}"
      # 两种都算数：等待期间被改写过；或者刚写完没多久（agent 比哨兵先跑完的情况）。
      # 上一轮留下的结果文件通常是几十分钟前的，落不进这个窗口。
      age=$(( $(date +%s) - cur_mtime )); [ "$age" -lt 0 ] && age=0
      if [ "$cur_mtime" -gt "$base_mtime" ] || [ "$age" -le "$fresh_window" ]; then
        echo "RESULT: $file has $marker"
        exit 0
      elif [ "$stale_warned" -eq 0 ]; then
        echo "WARN: $marker already present in a file untouched since we started; treating as stale" >&2
        stale_warned=1
      fi
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
