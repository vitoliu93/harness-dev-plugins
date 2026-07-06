#!/usr/bin/env bash
# Tier 0/1 machine verification for a dispatched worktree. Zero LLM tokens.
# usage: verify.sh -d <worktree> -a <acceptance-cmd> [-b <base-ref>] \
#                  [-p <allowed-paths-file>] [-t <test-path>]...
#   -d  worktree the engine worked in
#   -a  acceptance command, run inside the worktree; its exit code is check #1
#   -b  pre-dispatch base ref/sha for diffing (default HEAD = uncommitted only;
#       pass the sha you dispatched from if the engine commits)
#   -p  file of glob patterns (one per line, # comments ok); every changed file
#       must match one, else FAIL
#   -t  test path the brief forbade touching; any diff under it = FAIL (repeatable)
# exit: 0 PASS (warnings allowed), 1 FAIL, 2 usage
set -u

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

DIR="" ACC="" PATHS_FILE="" BASE="HEAD"
TESTS=()
while getopts "d:a:b:p:t:" opt; do
  case $opt in
    d) DIR=$OPTARG ;;
    a) ACC=$OPTARG ;;
    b) BASE=$OPTARG ;;
    p) PATHS_FILE=$OPTARG ;;
    t) TESTS+=("$OPTARG") ;;
    *) usage ;;
  esac
done
[[ -n $DIR && -n $ACC ]] || usage
cd "$DIR" || { echo "FAIL worktree: $DIR not found"; echo "VERDICT: FAIL"; exit 1; }

fails=0 warns=0

# changed = committed-since-base + unstaged + untracked
changed=$( { git diff "$BASE" --name-only; git ls-files --others --exclude-standard; } | sort -u )

# check: allowed paths
if [[ -n $PATHS_FILE ]]; then
  out_of_scope=()
  while IFS= read -r f; do
    [[ -z $f ]] && continue
    ok=0
    while IFS= read -r pat; do
      [[ -z $pat || $pat == \#* ]] && continue
      # shellcheck disable=SC2254
      case $f in $pat) ok=1; break ;; esac
    done < "$PATHS_FILE"
    (( ok )) || out_of_scope+=("$f")
  done <<< "$changed"
  if (( ${#out_of_scope[@]} )); then
    echo "FAIL scope: out-of-scope changes: ${out_of_scope[*]}"; (( fails++ ))
  else
    echo "PASS scope"
  fi
fi

# check: forbidden test paths untouched
for t in ${TESTS[@]+"${TESTS[@]}"}; do
  touched=$(git diff "$BASE" --name-only -- "$t")
  if [[ -n $touched ]]; then
    echo "FAIL tests-untouched: $t was modified: $touched"; (( fails++ ))
  else
    echo "PASS tests-untouched: $t"
  fi
done

# check: added skip/only/disable markers (WARN — engines game tests this way)
markers=$(git diff "$BASE" | grep -cE '^\+.*(\.skip\(|\.only\(|\bxfail\b|pytest\.mark\.skip|@Disabled|it\.todo\()' || true)
if (( markers > 0 )); then
  echo "WARN skip-markers: $markers added skip/only/disable marker line(s)"; (( warns++ ))
fi

# check: acceptance command (last — it's the slow one)
if bash -c "$ACC" >/dev/null 2>&1; then
  echo "PASS acceptance: $ACC"
else
  echo "FAIL acceptance: '$ACC' exited non-zero"; (( fails++ ))
fi

if (( fails )); then echo "VERDICT: FAIL ($fails failed, $warns warned)"; exit 1; fi
echo "VERDICT: PASS ($warns warned)"
