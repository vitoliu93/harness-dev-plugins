---
name: ccobs
description: >-
  Build or query the agent observability ledger obs.db, and roll its distilled rules into per-project digests.
  Use when ingesting sessions, reading usage stats, fetching Cursor message_parts, or rebuilding the rules digest.
metadata:
  kind: meta
---

# ccobs

Raw tool logs → SQLite evidence layer → observations distill (claude-code only)
→ rollup into markdown rule digests. DB lives at `${CCOBS_DIR:-$HOME/.claude/observability/}`
and stores facts and pointers; images keep only size and sha256. Do not delete it to rebuild:
`observations` costs model calls and raw claude-code JSONL gets purged. The digests under
`rules/` carry hand corrections made in `/debrief`, so only ever append to them.

Set `CCOBS_SKILL_DIR` to the absolute directory containing this loaded
`SKILL.md`. Keep the assignment and use in the same shell command because shell
state does not persist between tool calls.

## Quick path

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bun "$CCOBS_SKILL_DIR/scripts/ingest.ts"
sqlite3 -header ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db "SELECT * FROM v_tool_overview LIMIT 5"
```

Before recall/take-over on a fresh session, resolve the same `CCOBS_SKILL_DIR`
and run `scripts/ingest.ts`; skip if missing.

## Rules digest

`scripts/rollup.ts` folds `observations.learn_candidates` into one markdown file
per project plus `_global.md`, under `${CCOBS_DIR:-$HOME/.claude/observability}/rules/`.
The SessionStart hook reads them with zero model calls.

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bun "$CCOBS_SKILL_DIR/scripts/rollup.ts" --dry-run
```

- Incremental, watermarked on `distilled_at` (never `ended_at`: distill lags and retries)
- The model only classifies new candidates as "same as rule #n" or "new"; counts and
  wording are done in code, so a hand-edited line is never reworded
- Refuses to write if the digest changed while it was merging; keeps 5 backups in `rules/.bak/`
- Rides the hourly launchd job, never the Stop hook
- After merging it sweeps each project's `.claude/LEARNED.md`: entries dated
  before that scope's watermark are deleted, so the inbox only holds what the
  pipeline hasn't caught up with

## Todo ledger

`scripts/todo.ts` keeps problems found but not handled (`todos` in obs.db).
Agents add with `add --title --why --evidence`; distill files `todo_candidates`
and closes items a session resolved (evidence required); `scripts/todo-review.ts`
runs daily at the end of the launchd chain: merges rewordings, then pushes the
top 3, stale items and yesterday's automatic closes to Feishu
(`${CCOBS_DIR}/notify.json`). `reopen <id>` undoes a wrong close.

## Read on demand

- [data-model.md](references/data-model.md) — source/model, eight adapters
- [operations.md](references/operations.md) — install, ingest flags, layout
- [queries.md](references/queries.md) — views, Cursor SQL
- [data-quality.md](references/data-quality.md) — filters, new source, wiring
