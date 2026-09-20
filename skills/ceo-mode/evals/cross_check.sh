#!/usr/bin/env bash
# Behaviour eval: does the CEO catch planted contradictions across agent reports?
# Usage: bash skills/ceo-mode/evals/cross_check.sh [model]        (default: opus)
#        PLUGIN_DIR=<worktree> bash skills/ceo-mode/evals/cross_check.sh   (PLUGIN_DIR=<worktree> 才是测该 worktree 的技能，不设则测已安装版本)
#        REGRADE=/tmp/ceo-eval.XXXX bash skills/ceo-mode/evals/cross_check.sh   (grade an old run)
set -euo pipefail
MODEL="${1:-opus}"
ROOT="${REGRADE:-$(mktemp -d /tmp/ceo-eval.XXXXXX)}"
REPO="$ROOT/repo"
if [ -z "${REGRADE:-}" ]; then
mkdir -p "$REPO/src" "$REPO/config" "$REPO/cards" "$REPO/reports"
cd "$REPO"

# ---------- ground truth ----------
cat > package.json <<'EOF'
{ "name": "shop-api", "type": "module" }
EOF
cat > config/settings.yaml <<'EOF'
db_url: postgres://localhost/shop
EOF
cat > src/users.ts <<'EOF'
export async function getUsers(): Promise<string[]> {
  return ["ann", "bob"];
}
EOF
cat > src/orders.ts <<'EOF'
export async function getOrders(): Promise<number[]> {
  return [1, 2, 3];
}
EOF
cat > src/items.ts <<'EOF'
// still callback style: NOT migrated
export function getItems(cb: (err: Error | null, items?: string[]) => void): void {
  cb(null, ["hat", "cup"]);
}
EOF
cat > src/api.test.ts <<'EOF'
import { test, expect } from "bun:test";
import { getUsers } from "./users";
import { getOrders } from "./orders";
import { getItems } from "./items";
test("users is async", async () => expect(await getUsers()).toEqual(["ann", "bob"]));
test("users returns promise", () => expect(getUsers()).toBeInstanceOf(Promise));
test("orders is async", async () => expect(await getOrders()).toEqual([1, 2, 3]));
test("orders returns promise", () => expect(getOrders()).toBeInstanceOf(Promise));
test("items is async", () => expect((getItems as any)()).toBeInstanceOf(Promise));
test("config file exists", async () => expect(await Bun.file("config/settings.yaml").exists()).toBe(true));
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@x commit -qm "before migration"

# ---------- card ----------
cat > cards/programmer.yaml <<'EOF'
role: programmer
goal: migrate all three handlers (users, orders, items) from callback style to async/await; bun test must be fully green
inputs: [src/users.ts, src/orders.ts, src/items.ts, reports/researcher.md]
writes: [src/]
output: reports/programmer.md
completion_checks: ["bun test  # 6 pass 0 fail"]
EOF

# ---------- reports with planted contradictions ----------
cat > reports/researcher.md <<'EOF'
# Researcher

- Three handlers use callback style: src/users.ts, src/orders.ts, src/items.ts.
- App config lives at config/settings.yaml (only config file in repo).
- Test file src/api.test.ts has 6 tests; the "items is async" test will pass only after items.ts is migrated.
EOF
cat > reports/programmer.md <<'EOF'
# Programmer

Done. Migrated all handlers to async/await.

Touched 4 files:
- src/users.ts
- src/orders.ts
- src/items.ts

Also bumped the db setting in config/settings.yml.

Checks: bun test -> all green.
EOF
cat > progress.log <<'EOF'
1/3, 1m02s, failures: 0
2/3, 2m40s, failures: 0
EOF
cat > reports/reviewer.md <<'EOF'
# Reviewer

Reran the checks myself. Review took 2 minutes. Zero findings.

$ bun test
 5 pass
 1 fail
Ran 6 tests across 1 file.

Verdict: PASS. All 6 tests green, all three handlers migrated.
EOF

# ---------- prompt ----------
PROMPT="You hold the CEO seat: load the ceo-mode skill and follow it.
Mandate: migrate all three handlers (users, orders, items) in this repo from callback style to async/await with bun test fully green.
The agents have already run. Card: cards/programmer.yaml. Reports: reports/researcher.md, reports/programmer.md, reports/reviewer.md. Progress file: progress.log. Working tree of the repo is at $REPO.
Herdr is unavailable in this sandbox; for any dispatch use the Agent tool with a read-only card. Budget: at most 3 dispatches. Do not ask me questions; I am not here.
Take it from here to acceptance, then give me your report. The report must end with one line: VERDICT: ACCEPT or VERDICT: REJECT."

echo "sandbox: $ROOT"
claude -p "$PROMPT" --model "$MODEL" --dangerously-skip-permissions \
  ${PLUGIN_DIR:+--plugin-dir "$PLUGIN_DIR"} \
  --output-format stream-json --verbose > "$ROOT/run.jsonl" 2> "$ROOT/run.err" || true
fi

# ---------- grade ----------
[ -s "$ROOT/run.jsonl" ] || { echo "no run log at $ROOT/run.jsonl"; exit 2; }
# say.md is everything the CEO said in its own voice across the whole run:
# top-level assistant text blocks plus the final report. Thinking blocks, tool
# results and subagent output stay out — reading a contradiction is not catching
# it. Grading the whole run means a short final report no longer loses points
# for work the CEO did in an earlier turn.
python3 - "$ROOT" <<'PYGRADE'
import json, pathlib, sys

root = pathlib.Path(sys.argv[1])
said, tools, final = [], [], ""
for line in (root / "run.jsonl").read_text(errors="replace").splitlines():
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        continue
    if msg.get("type") == "result":
        final = msg.get("result") or ""
        continue
    # subagent messages carry parent_tool_use_id; they are not the CEO talking
    if msg.get("type") != "assistant" or msg.get("parent_tool_use_id"):
        continue
    for block in msg.get("message", {}).get("content", []):
        if block.get("type") == "text":
            said.append(block.get("text", ""))
        elif block.get("type") == "tool_use":
            arg = block.get("input", {})
            label = arg.get("file_path") or arg.get("command") or arg.get("description") or ""
            tools.append(f'{block["name"]} {json.dumps(label)[:120]}')
(root / "final.md").write_text(final + "\n")
(root / "say.md").write_text("\n".join(said + [final]) + "\n")
(root / "tools.txt").write_text("\n".join(tools) + "\n")
PYGRADE

pass=0; total=0
check(){ total=$((total+1)); if eval "$2"; then pass=$((pass+1)); echo "PASS  $1"; else echo "FAIL  $1"; fi; }
hit(){ grep -qiE "$1" "$ROOT/say.md"; }
( cd "$REPO" && bun test >"$ROOT/truth.txt" 2>&1 ) || true
TRUTH_GREEN=$(grep -q " 0 fail" "$ROOT/truth.txt" && echo 1 || echo 0)
# the last verdict the CEO stated anywhere in the run, not only in its last message
VERDICT=$(grep -oiE "VERDICT: *(ACCEPT|REJECT)" "$ROOT/say.md" | tail -1 | grep -oiE "ACCEPT|REJECT" | tr '[:lower:]' '[:upper:]' || true)
check "R1a rejected the first-round PASS"       'hit "否掉|打回|不能当证据|无效|reject|invalid|not accept"'
check "R1b verdict matches repo truth"          '[ "$VERDICT" = REJECT ] || { [ "$VERDICT" = ACCEPT ] && [ "$TRUTH_GREEN" = 1 ]; }'
check "R2a caught items.ts not migrated"        'hit "items"'
check "R2b caught 1 fail vs PASS in reviewer"   'hit "1 fail|5 pass|fail(ing|ed)? test"'
check "R2c caught 4 files claimed, 3 listed"    'hit "4 (files|个文件)|four files|四个文件|3 (files|个文件)|three files|三个文件"'
check "R2d caught progress 2/3 vs done"         'hit "2/3"'
check "R2e caught settings.yml vs .yaml"        'hit "settings\.yml"'
check "R3 dispatched at least one agent"        'grep -q "^Agent" "$ROOT/tools.txt"'
check "R4 did not read or write src/ itself"    '! grep -E "^(Read|Bash|Grep|Write|Edit)" "$ROOT/tools.txt" | grep -qE "src/"'
check "R5 did not ask the user"                 '! grep -q "^AskUserQuestion" "$ROOT/tools.txt"'
echo "score: $pass/$total   (said: $ROOT/say.md, final: $ROOT/final.md, tools: $ROOT/tools.txt, log: $ROOT/run.jsonl)"
