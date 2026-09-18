#!/usr/bin/env bash
# Self-test for wait-result.sh covering all completion, stall, and fallback branches.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAIT_SCRIPT="$SCRIPT_DIR/wait-result.sh"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

export HERDR_STUB_DIR="$TMP_DIR"
echo "running" > "$TMP_DIR/agent_status"
echo "working on task..." > "$TMP_DIR/pane_text"

# Configurable fake herdr stub driven by files in HERDR_STUB_DIR
mkdir -p "$TMP_DIR/bin"
cat << 'EOF' > "$TMP_DIR/bin/herdr"
#!/usr/bin/env bash
status_file="$HERDR_STUB_DIR/agent_status"
pane_file="$HERDR_STUB_DIR/pane_text"
st=$(cat "$status_file" 2>/dev/null || echo "running")
pt=$(cat "$pane_file" 2>/dev/null || echo "working on task...")
case "${1:-}" in
  agent)
    case "${2:-}" in
      get)
        echo "{\"result\":{\"agent\":{\"agent_status\":\"$st\"}}}"
        ;;
      read)
        echo "$pt"
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
  *)
    exit 0
    ;;
esac
EOF
chmod +x "$TMP_DIR/bin/herdr"
export PATH="$TMP_DIR/bin:$PATH"
export WAIT_RESULT_INTERVAL=0.05

reset_stub() {
  echo "running" > "$TMP_DIR/agent_status"
  echo "working on task..." > "$TMP_DIR/pane_text"
}

run_wait() {
  set +e
  WAIT_OUT=$("$WAIT_SCRIPT" "$@" 2>&1)
  WAIT_RC=$?
  set -e
}

passed_count=0

assert_rc() {
  local expected=$1 msg=$2
  if [ "$WAIT_RC" -ne "$expected" ]; then
    echo "FAIL: $msg (expected $expected, got $WAIT_RC; output: $WAIT_OUT)" >&2
    exit 1
  fi
  passed_count=$((passed_count + 1))
  echo "PASS: $msg (exit $WAIT_RC)"
}

# --- 1. Missing progress file -> 5 (stderr notes missing file and actual elapsed) ---
reset_stub
run_wait agent-1 "$TMP_DIR/nonexistent-res.md" DONE 5 "$TMP_DIR/nonexistent-prog.txt" 1
assert_rc 5 "1. Missing progress file after stall_limit -> 5"
if ! echo "$WAIT_OUT" | grep -q "STALLED: progress file missing"; then
  echo "FAIL: stderr should report missing progress file, got: $WAIT_OUT" >&2
  exit 1
fi

# --- 2. Grace period: missing progress file within stall_limit does NOT report 5 ---
reset_stub
run_wait agent-2 "$TMP_DIR/nonexistent-res.md" DONE 1 "$TMP_DIR/nonexistent-prog.txt" 3
assert_rc 4 "2. Missing progress file inside grace period -> timeout 4 (never 5)"

# --- 3. Expired progress file -> 5 (stderr includes last line of progress file) ---
reset_stub
PROG_3="$TMP_DIR/prog3.txt"
printf "step 1: fetch\nstep 2: processing items\n" > "$PROG_3"
touch -t 202001010000 "$PROG_3"
run_wait agent-3 "$TMP_DIR/nonexistent-res.md" DONE 5 "$PROG_3" 1
assert_rc 5 "3. Expired progress file -> 5"
if ! echo "$WAIT_OUT" | grep -q "step 2: processing items"; then
  echo "FAIL: stderr should contain last line of progress file, got: $WAIT_OUT" >&2
  exit 1
fi

# --- 4. Legacy 4-argument call (no progress file given) ---
# 4a: marker ready on last line -> 0
printf "header\nDONE\n" > "$TMP_DIR/res4a.md"
run_wait agent-4a "$TMP_DIR/res4a.md" DONE 2
assert_rc 0 "4a. Legacy 4-arg call with marker -> 0"

# 4b: no marker -> times out 4, never 5
printf "header\nworking\n" > "$TMP_DIR/res4b.md"
run_wait agent-4b "$TMP_DIR/res4b.md" DONE 1
assert_rc 4 "4b. Legacy 4-arg call without marker -> timeout 4 (never 5)"

# --- 5. Legacy 3-argument call (default timeout) ---
printf "DONE\n" > "$TMP_DIR/res5.md"
run_wait agent-5 "$TMP_DIR/res5.md" DONE
assert_rc 0 "5. Legacy 3-arg call -> 0"

# --- 6. Actively updated progress file does NOT stall -> normal timeout 4 ---
reset_stub
PROG_6="$TMP_DIR/prog6.txt"
printf "alive\n" > "$PROG_6"
(
  for _ in $(seq 1 15); do
    touch "$PROG_6"
    sleep 0.2
  done
) &
toucher_pid=$!
run_wait agent-6 "$TMP_DIR/nonexistent-res.md" DONE 3 "$PROG_6" 2
kill "$toucher_pid" 2>/dev/null || true
wait "$toucher_pid" 2>/dev/null || true
assert_rc 4 "6. Actively updated progress file does not stall -> timeout 4"

# --- 7. Result file never created -> times out 4 ---
reset_stub
run_wait agent-7 "$TMP_DIR/never-created-res.md" DONE 1
assert_rc 4 "7. Missing result file -> timeout 4"

# --- 8. Marker format & line position checks ---
# 8a: marker only in the middle -> not complete (timeout 4)
printf "DONE\nstill running\n" > "$TMP_DIR/res8a.md"
run_wait agent-8a "$TMP_DIR/res8a.md" DONE 1
assert_rc 4 "8a. Marker in middle only -> timeout 4"

# 8b: marker as substring in last line -> not complete (timeout 4)
printf "work finished\nALL DONE now\n" > "$TMP_DIR/res8b.md"
run_wait agent-8b "$TMP_DIR/res8b.md" DONE 1
assert_rc 4 "8b. Marker as substring of last line -> timeout 4"

# 8c: marker with trailing whitespace & trailing blank lines -> complete (0)
printf "work\nDONE   \n\n   \n" > "$TMP_DIR/res8c.md"
run_wait agent-8c "$TMP_DIR/res8c.md" DONE 2
assert_rc 0 "8c. Marker with trailing whitespace and blank lines -> 0"

# 8d: marker with CRLF line endings -> complete (0)
printf "work\r\nDONE\r\n" > "$TMP_DIR/res8d.md"
run_wait agent-8d "$TMP_DIR/res8d.md" DONE 2
assert_rc 0 "8d. Marker with CRLF -> 0"

# --- 9. Result ready beats stale progress file -> 0 ---
reset_stub
printf "log\nDONE\n" > "$TMP_DIR/res9.md"
PROG_9="$TMP_DIR/prog9.txt"
printf "old progress\n" > "$PROG_9"
touch -t 202001010000 "$PROG_9"
run_wait agent-9 "$TMP_DIR/res9.md" DONE 2 "$PROG_9" 0
assert_rc 0 "9. Result ready beats stale progress file -> 0"

# --- 10. Empty result file does not crash grep -> times out 4 ---
reset_stub
: > "$TMP_DIR/res10.md"
run_wait agent-10 "$TMP_DIR/res10.md" DONE 1
assert_rc 4 "10. Empty result file -> timeout 4"

# --- 11. Existing herdr status branches ---
# 11a: stuck on permission prompt -> exit 2
reset_stub
echo "Do you want to proceed? (y/n)" > "$TMP_DIR/pane_text"
run_wait agent-11a "$TMP_DIR/res10.md" DONE 3
assert_rc 2 "11a. Stuck on permission prompt -> 2"

# 11b: blocked status -> exit 2
reset_stub
echo "blocked" > "$TMP_DIR/agent_status"
run_wait agent-11b "$TMP_DIR/res10.md" DONE 3
assert_rc 2 "11b. Blocked agent status -> 2"

# 11c: idle status without background shells -> exit 3 after quiet threshold
reset_stub
echo "idle" > "$TMP_DIR/agent_status"
echo "no shells running" > "$TMP_DIR/pane_text"
run_wait agent-11c "$TMP_DIR/res10.md" DONE 3
assert_rc 3 "11c. Idle without background shells -> 3"

# 11d: idle status with background shells running -> does not exit 3, times out 4
reset_stub
echo "idle" > "$TMP_DIR/agent_status"
echo "1 shell still running" > "$TMP_DIR/pane_text"
run_wait agent-11d "$TMP_DIR/res10.md" DONE 1
assert_rc 4 "11d. Idle with running background shell -> not 3, timeout 4"

echo "ALL $passed_count TESTS PASSED"
