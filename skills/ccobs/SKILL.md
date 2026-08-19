---
name: ccobs
description: >-
  Build or query the agent observability ledger obs.db.
  Use when ingesting sessions, reading usage stats, or fetching Cursor message_parts transcripts.
metadata:
  kind: meta
---

# ccobs

Raw tool logs → SQLite evidence layer → observations distill (claude-code only).
DB is a rebuildable index at `${CCOBS_DIR:-$HOME/.claude/observability/}`.

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

## Read on demand

- [data-model.md](references/data-model.md) — source/model, eight adapters
- [operations.md](references/operations.md) — install, ingest flags, layout
- [queries.md](references/queries.md) — views, Cursor SQL
- [data-quality.md](references/data-quality.md) — filters, new source, wiring
