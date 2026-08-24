# Data quality, new sources, wiring

## Known quirks

- Filter prompt-shaped `hook_runs.command` with `WHERE command LIKE '%${%'` or length.
- droid/grok lack per-turn tokens; codex skill column is NULL by design.
- cursor-ide/agent: partial seq, unknown project, SQLITE_CANTOPEN → retry next run.
- kimi-code: cwd from workspaces.json; k3 may also appear under claude-code — do not double-count.
- Duplicate claude main sessions: dedupe by `(project, started_at)` before counting.
- Synthetic warmup sessions (identical first prompt, <20s, zero tool_calls): filter before recall/stats.
- `turns.stop_reason` NULL on old rows until DB rebuild.
- `observations` 不覆盖全部会话：distill 只收 `turns >= 3` 且输出 token `>= 500` 的 claude-code main 会话。按 observations 算占比会偏高，分母要从 `sessions` 取。
- `distill_model = 'skipped:no-raw-file'` 是墓碑行，summary 为空、learn_candidates 为 `[]`，统计时排掉。

## Add a source

1. Register `{name, discover, ingest}` in `ingest.ts`; reuse byte-offset or watermark pattern.
2. Missing fields → NULL; no hook_runs for non-claude sources.
3. `project` must use `encodeProject(cwd)`.

## Wiring

- Stop hook → `obs-enqueue.ts`
- skill-atlas usage section reads `v_skill_usage` / change-since-edit signals
- debrief may read this session's turn stats at close
