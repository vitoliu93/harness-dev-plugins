#!/usr/bin/env bash
set -e
OBS="$HOME/.claude/observability"
# never overwrite a real ledger: outside the sandbox, write the fixture next to the case
[ -e "$OBS/obs.db" ] && OBS="$(pwd)/ccobs"
HERE=$(pwd); SID=7f3c2a10-fixture-take-over
mkdir -p repo/src "$OBS" transcripts
cd repo
cat > src/price.ts <<'J'
export function price(cents: number): string { return (cents / 100).toFixed(2); }
export function priceWithCurrency(cents: number, cur: string): string { return `${cur} ${price(cents)}`; }
J
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.com commit -qm "feat(price): add priceWithCurrency (phase 1)"
cd "$HERE"
u(){ printf '{"type":"user","sessionId":"%s","cwd":"%s","timestamp":"%s","message":{"role":"user","content":"%s"}}\n' "$SID" "$HERE/repo" "$1" "$2"; }
a(){ printf '{"type":"assistant","sessionId":"%s","cwd":"%s","timestamp":"%s","message":{"role":"assistant","content":[{"type":"text","text":"%s"}]}}\n' "$SID" "$HERE/repo" "$1" "$2"; }
{
u 2026-09-12T09:00:00Z "给 src/price.ts 加多币种格式化：第一步加 priceWithCurrency，第二步加 formatLocale(cents, locale)，第三步补 bun 测试。"
a 2026-09-12T09:01:00Z "好的。我先把 price() 改成接收 currency 参数。"
u 2026-09-12T09:02:00Z "不要改 price() 的签名，外部有人在用。只加新函数。"
a 2026-09-12T09:03:00Z "明白，price() 保持不变。已加 priceWithCurrency 并提交（phase 1）。"
u 2026-09-12T09:05:00Z "formatLocale 不许引入 npm 依赖，用 Intl.NumberFormat。"
a 2026-09-12T09:06:00Z "收到。正在写 formatLocale……"
} > "transcripts/$SID.jsonl"
sqlite3 "$OBS/obs.db" <<SQL
CREATE TABLE sessions (session_id TEXT PRIMARY KEY, kind TEXT NOT NULL, parent_id TEXT, project TEXT NOT NULL, cwd TEXT, git_branch TEXT, cc_version TEXT, started_at TEXT, ended_at TEXT, file_path TEXT NOT NULL, subagent_type TEXT, source TEXT NOT NULL DEFAULT 'claude-code');
CREATE TABLE observations (session_id TEXT PRIMARY KEY, distilled_at TEXT, distill_model TEXT, task_type TEXT, outcome TEXT, corrections INTEGER, dispatch_engine TEXT, dispatch_result TEXT, summary TEXT, learn_candidates TEXT, sop_candidate TEXT, conclusion TEXT, files TEXT);
INSERT INTO sessions(session_id,kind,project,cwd,git_branch,started_at,ended_at,file_path) VALUES ('$SID','main','price-lib','$HERE/repo','master','2026-09-12T09:00:00Z','2026-09-12T09:06:00Z','$HERE/transcripts/$SID.jsonl');
INSERT INTO observations(session_id,task_type,outcome,summary) VALUES ('$SID','feature','partial','给 price.ts 加多币种格式化，做到一半');
SQL
