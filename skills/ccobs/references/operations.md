# Operations and layout

## Layout

- DB / queue / logs: `${CCOBS_DIR:-$HOME/.claude/observability/}` (override with `CCOBS_DIR`).
- Dynamic ledgers never live in the plugin repo.
- Scripts under `${CLAUDE_SKILL_DIR}/scripts/`:
  - `schema.sql`, `ingest.ts`, `obs-enqueue.ts`, `install.sh`, `distill.ts`, `distill-prompt.md`
- `message_parts` may contain secrets — redact before sharing.

## Install and ingest

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/install.sh
bun ${CLAUDE_SKILL_DIR}/scripts/ingest.ts
bun ${CLAUDE_SKILL_DIR}/scripts/ingest.ts --source codex
bun ${CLAUDE_SKILL_DIR}/scripts/ingest.ts --queue
bun ${CLAUDE_SKILL_DIR}/scripts/ingest.ts --project <keyword>
sqlite3 -header -column ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db "SELECT * FROM v_tool_overview"
bun ${CLAUDE_SKILL_DIR}/scripts/distill.ts --dry-run
```

## On-demand sync

Recent sessions may not be ingested yet. Before recall or take-over, run incremental ingest (idempotent):

```bash
bun ${CCOBS_SKILL_DIR:-${CLAUDE_PLUGIN_ROOT}/skills/ccobs}/scripts/ingest.ts
```

Skip silently if the script is missing. Verify with `sqlite3 ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db`.
