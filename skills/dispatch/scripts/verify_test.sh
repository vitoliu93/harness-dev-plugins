#!/usr/bin/env bash
# Self-check for verify.sh: clean / out-of-scope / test-tamper. Run directly.
set -eu
V="$(cd "$(dirname "$0")" && pwd)/verify.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
git init -q repo && cd repo
git commit -q --allow-empty -m base
mkdir -p src tests
echo v1 > src/a.txt
echo 'exit 0' > tests/test_a.sh
git add -A && git commit -q -m seed
BASE=$(git rev-parse HEAD)
printf 'src/*\n' > "$TMP/allowed.txt"

run() { bash "$V" -d "$PWD" -a true -b "$BASE" -p "$TMP/allowed.txt" -t tests; }

# case 1: clean — in-scope edit, tests untouched
echo v2 > src/a.txt
run > "$TMP/out1" && rc=0 || rc=$?
[[ $rc -eq 0 ]] || { echo "FAIL case1 (clean): expected PASS"; cat "$TMP/out1"; exit 1; }

# case 2: out-of-scope file
echo rogue > rogue.txt
run > "$TMP/out2" && rc=0 || rc=$?
[[ $rc -eq 1 ]] && grep -q "FAIL scope" "$TMP/out2" || { echo "FAIL case2 (scope): expected scope FAIL"; cat "$TMP/out2"; exit 1; }
rm rogue.txt

# case 3: test file tampered
echo 'exit 0 # weakened' > tests/test_a.sh
run > "$TMP/out3" && rc=0 || rc=$?
[[ $rc -eq 1 ]] && grep -q "FAIL tests-untouched" "$TMP/out3" || { echo "FAIL case3 (tamper): expected tests-untouched FAIL"; cat "$TMP/out3"; exit 1; }

echo "verify_test: all 3 cases passed"
