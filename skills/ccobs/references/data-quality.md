# Data quality, new sources, wiring

## Known quirks

- Filter prompt-shaped `hook_runs.command` with `WHERE command LIKE '%${%'` or length.
- droid/grok lack per-turn tokens; codex skill column is NULL by design.
- cursor-ide/agent: partial seq, unknown project, SQLITE_CANTOPEN → retry next run.
- kimi-code: cwd from workspaces.json; k3 may also appear under claude-code — do not double-count.
- Duplicate claude main sessions: dedupe by `(project, started_at)` before counting.
- Synthetic warmup sessions (identical first prompt, <20s, zero tool_calls): filter before recall/stats.
- `turns.stop_reason` NULL on old rows until DB rebuild.

## Add a source

1. Register `{name, discover, ingest}` in `ingest.ts`; reuse byte-offset or watermark pattern.
2. Missing fields → NULL; no hook_runs for non-claude sources.
3. `project` must use `encodeProject(cwd)`.

## Wiring

- Stop hook → `obs-enqueue.ts`
- skill-atlas usage section reads `v_skill_usage` / change-since-edit signals
- debrief may read this session's turn stats at close
