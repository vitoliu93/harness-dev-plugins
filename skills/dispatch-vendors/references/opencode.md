> ⚠️ **下舰存档(2026-07-22)** — 不在现役 vendor 名单(名单见 ../SKILL.md),留档供重新上舰或历史排查参考。

# opencode — Volcengine coding-plan backend

Flags verified 2026-07-16 via `--help`. Quota: Volcengine coding plan —
independent of Anthropic and DeepSeek.

```bash
source ~/.zshenv && opencode run "<brief>" -m volcengine-plan/kimi-k2.7-code --format json --auto
source ~/.zshenv && opencode run -s <session-id> "<consolidated fix list>" --format json --auto   # fix round
```

- Model: `-m provider/model`, provider `volcengine-plan`
  (`~/.config/opencode/opencode.json`). **Verdicts are per CLI×model, not
  per CLI** (2026-07-16 live): `kimi-k2.7-code` — **禁用**, stable 0-token
  silent no-op (3/3 runs even with `--auto`); `glm-5.2` — works, obey the
  output-cap discipline below; `doubao-seed-2.0-pro` — works incl. **vision**
  (image transcription verified). Also carries `deepseek-v4-{flash,pro}`,
  `minimax-{m2.7,m3}` etc., unprobed. `--variant high|max|minimal` =
  reasoning effort.
- Output: `--format json`; session id = `sessionID` field on the JSON event
  lines.
- Resume: `-s/--session <id>` · `-c/--continue` (latest) · `--fork` (branch,
  needs `-s` or `-c`) · `--title <t>` names the session.
- **`--auto` is required for ANY task that uses tools — including read-only
  review** (verified live: without it the session emits step_start/step_finish
  with 0 tokens and exits 0, a silent no-op). Only pure-text prompts survive
  without it.
- Silent-failure tell: `step_finish` with `"tokens": {"total": 0}` = the model
  produced nothing — treat as FAIL and re-dispatch (fresh session; resuming a
  no-op session can no-op again), or fail over kimi-k2.7-code ↔ glm-5.2.
- **Output cap ~4096 tokens per turn** (verified: long report truncated,
  `reason: "unknown"`, text never emitted as an event). Brief must demand
  compact output (ranked one-liners, hard item caps), or have the vendor
  write its report to a file and just confirm the path.
- Read-only recon analog: `--agent plan` (also `build` default, `explore`,
  `general`); no per-invocation tool-restriction flag — permissions are
  config-based per agent.
- Working dir: inherits process cwd (`--dir` is remote-attach only).
- Attach files to the brief: `-f/--file <path>`.
