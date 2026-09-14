#!/usr/bin/env bash
set -e
OBS="$HOME/.claude/observability"
# never overwrite a real ledger: outside the sandbox, write the fixture next to the case
[ -e "$OBS/obs.db" ] && OBS="$(pwd)/ccobs"
C="$OBS"; mkdir -p "$C/rules"
cat > "$C/rules/_global.md" <<'J'
- 萤火虫支付回调重试必须按 event_id 去重 ×3 (最近 2026-08-20)
- 日志时间用本地时区展示 ×2 (2026-09-08)
J
sqlite3 "$C/obs.db" <<'SQL'
CREATE TABLE sessions (session_id TEXT PRIMARY KEY, kind TEXT NOT NULL, parent_id TEXT, project TEXT NOT NULL, cwd TEXT, git_branch TEXT, cc_version TEXT, started_at TEXT, ended_at TEXT, file_path TEXT NOT NULL, subagent_type TEXT, source TEXT NOT NULL DEFAULT 'claude-code');
CREATE TABLE observations (session_id TEXT PRIMARY KEY, distilled_at TEXT, distill_model TEXT, task_type TEXT, outcome TEXT, corrections INTEGER, dispatch_engine TEXT, dispatch_result TEXT, summary TEXT, learn_candidates TEXT, sop_candidate TEXT, conclusion TEXT, files TEXT);
INSERT INTO sessions(session_id,kind,project,started_at,file_path) VALUES
 ('sess-firefly-01','main','shop','2026-03-02T10:00:00Z','/x/1.jsonl'),
 ('sess-firefly-02','main','shop','2026-04-02T10:00:00Z','/x/2.jsonl'),
 ('sess-firefly-03','main','shop','2026-05-02T10:00:00Z','/x/3.jsonl'),
 ('sess-firefly-04','main','shop','2026-08-01T10:00:00Z','/x/4.jsonl'),
 ('sess-firefly-05','main','shop','2026-08-15T10:00:00Z','/x/5.jsonl'),
 ('sess-firefly-06','main','shop','2026-08-28T10:00:00Z','/x/6.jsonl'),
 ('sess-firefly-07','main','shop','2026-09-10T10:00:00Z','/x/7.jsonl');
INSERT INTO observations(session_id,task_type,outcome,summary) VALUES
 ('sess-firefly-01','research','done','调研萤火虫支付回调签名算法'),
 ('sess-firefly-02','bugfix','done','修复萤火虫支付回调重复入账'),
 ('sess-firefly-03','feature','partial','萤火虫支付回调加指数退避重试'),
 ('sess-firefly-04','bugfix','abandoned','萤火虫支付回调超时排查，放弃'),
 ('sess-firefly-05','feature','done','萤火虫支付回调按 event_id 去重'),
 ('sess-firefly-06','ops','done','萤火虫支付回调告警接入'),
 ('sess-firefly-07','bugfix','done','萤火虫支付回调重试风暴限流');
SQL
