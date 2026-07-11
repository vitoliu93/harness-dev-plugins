# Engine registry

**Single source of truth** for the dispatch fleet. SKILL.md names no engines —
when the fleet changes (new CLI, model swap, quota shift), edit only this
file. Flags and model ids below verified on this machine 2026-07-06 via
`--help` / `--list-models`.

## Routing & escalation ladder

| Rung | Engine | Use for |
|---|---|---|
| — | `cursor-agent --mode plan` (composer-2.5) | read-only 勘察 / 影响面分析 / codebase understanding — not execution |
| 1 | `dscode` (failover `arkcode`) | bulk implementation from a settled plan — cheapest typist |
| 2 | `cursor-agent` composer-2.5 | standard execution; benefits from Cursor's workspace index |
| 3 | `cursor-agent` gpt-5.5-high or claude-opus-4-8-thinking-high | hard tasks worth premium cursor quota |
| alt | `droid` | autonomous subtask wanting built-in worktree + autonomy levels (fixed model, sits ~rung 3) |

`BLOCKED` / verify-FAIL escalation moves one rung up (consumes retry budget).
Above rung 3 there is no engine — take the task back inline.

## dscode — claude binary, DeepSeek backend

```bash
dscode -p "<brief>" --model deepseek-v4-flash --output-format json
dscode -p -r <session-id> "<consolidated fix list>"   # resume for the fix round
```

- **model: slot-remapped** — zsh function (`~/.config/zsh/utils.sh`) wrapping
  `openclaude`; slots remapped opus→`deepseek-v4-pro[1m]`,
  sonnet/haiku→`deepseek-v4-flash[1m]`. The claude binary inherits the
  settings default model (currently opus → pro slot = the expensive one), so
  **always pass `--model deepseek-v4-flash` explicitly** for cheap bulk runs;
  omit it only when you deliberately want pro.
- resume: full claude-binary flags — `-r/--resume <session-id>`,
  `--fork-session`; session id is in the `--output-format json` result.
- The wrapper already sets `--permission-mode bypassPermissions`. Do NOT pass
  `--permission-mode` yourself — last flag wins and silently downgrades to a
  mode where non-edit tool calls get denied (no TTY in `-p` mode).
- Full Claude Code semantics — tools, hooks, skills, plugins all load.
- Quota: DeepSeek billing, independent of the Anthropic 5h window.

## arkcode — claude binary, Volcengine Ark backend

Same mechanism, flags, and resume story as dscode; Ark-hosted models
(**model: fixed**), third independent quota pool. Failover when DeepSeek
throttles.

## cursor-agent

```bash
cursor-agent -p "<brief>" --output-format json --model composer-2.5 --force
cursor-agent --mode plan -p "<question>" --model composer-2.5      # read-only 勘察
cursor-agent -p --resume <chatId> "<consolidated fix list>"        # fix round
```

- **model: selectable** — daily default `composer-2.5`; hard tasks
  `gpt-5.5-high` or `claude-opus-4-8-thinking-high`. Re-check ids with
  `--list-models` when escalating (names rotate as Cursor ships models).
- resume: `--resume <chatId>` (or `--continue` for the latest); chat id
  appears in the JSON output.
- `--force`/`--yolo` required for unattended edits; `--mode plan` is
  read-only and safe without it.
- Quota: Cursor Ultra subscription — plan-mode reads are the cheap way to
  spend it; premium models are the expensive way.

## droid — Factory CLI

```bash
droid exec -o json --auto low -w "<brief>"        # or -f brief.txt
droid exec -s <session-id> "<follow-up>"          # resume
```

- **model: fixed** — default `claude-opus-4-8`; leave `-m` alone (already
  chosen deliberately).
- resume: `-s/--session-id <id>` continues, `--fork <id>` branches.
- `-w` = native worktree isolation; `--auto low` for unattended safety.
- Quota: Factory account.

## claude — the real one (DO NOT use for bulk)

```bash
claude -p "<brief>" --model sonnet --output-format json --bare
```

- Shares the interactive 5h quota (verified: same stored credentials, no
  separate headless tier). Only when the task genuinely needs Anthropic
  models AND the main session must stay free — e.g. advisor ultra mode.
  `--bare` skips hooks/skills for reproducibility.
