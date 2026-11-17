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

Before reading a fresh session from the ledger, resolve the same `CCOBS_SKILL_DIR`
and run `scripts/ingest.ts`; skip if missing.

## Pipelines

Detail for all three: [pipelines.md](references/pipelines.md).

- **Rules digest** — `scripts/rollup.ts` folds distilled rule candidates into
  one markdown digest per project under `rules/`; the SessionStart hook reads
  them with zero model calls. Preview with `--dry-run`. It rides the hourly
  launchd job, never the Stop hook.
- **Todo ledger** — `scripts/todo.ts` keeps problems found but not handled.
  Record only work an agent can finish alone, with a known repo and a live
  anchor (IK id, commit, or a repo file). `reopen <id>` undoes a wrong close.
- **Autopilot** — `scripts/autopilot.ts` runs nightly, lands open items on each
  repo's integration branch and deploys to test. Never production or a Desktop
  release. User decisions: `todo.ts decisions`, `todo.ts decide <id> <n|dismiss>`.

## Read on demand

- [data-model.md](references/data-model.md) — source/model, eight adapters
- [operations.md](references/operations.md) — install, ingest flags, layout
- [pipelines.md](references/pipelines.md) — rules digest, todo ledger, autopilot
- [queries.md](references/queries.md) — views, Cursor SQL
- [data-quality.md](references/data-quality.md) — filters, new source, wiring
