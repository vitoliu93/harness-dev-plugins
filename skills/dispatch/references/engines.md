# Engine registry

**Single source of truth** for the dispatch fleet. SKILL.md names no engines —
when the fleet changes (new CLI, model swap, quota shift), edit only this
file. Flags and model ids below verified on this machine 2026-07-11 via
`--help` / `--list-models`.

**Default: prefix every engine invocation with `source ~/.zshenv &&`** — all
API keys live in `~/.zshenv` and must be injected into the invocation env; the
prefix is harmless for engines that don't need it.

## Routing & escalation ladder

Rung = engine ladder position (escalation moves up it); distinct from the
verification *tiers* in SKILL.md's pyramid.

| Rung | Engine | Use for |
|---|---|---|
| — | `cursor-agent --mode plan` (composer-2.5) | read-only 勘察 / 影响面分析 / codebase understanding — not execution |
| 1 | `dscode` (failover `arkcode`) | bulk implementation from a settled plan — cheapest typist |
| 1 | `opencode` kimi-k2.7-code or glm-5.2 | bulk implementation alternative — model diversity when the claude-binary wrappers stumble |
| 2 | `cursor-agent` composer-2.5 | standard execution; benefits from Cursor's workspace index |
| 3 | `cursor-agent` grok-4.5-xhigh, gpt-5.5-high, or claude-opus-4-8-thinking-high | hard tasks worth premium cursor quota |
| alt | `droid` | autonomous subtask wanting built-in worktree + autonomy levels (fixed model, sits ~rung 3) |

`BLOCKED` / verify-FAIL escalation moves one rung up (consumes retry budget).
Above rung 3 there is no engine — take the task back inline.

## dscode — claude binary, DeepSeek backend

```bash
dscode -p "<brief>" --model deepseek-v4-flash --output-format json
dscode -p -r <session-id> "<consolidated fix list>"   # resume for the fix round
```

- **model: slot-remapped** — zsh function (`~/.zshrc`) wrapping
  `openclaude`; slots remapped opus→`deepseek-v4-pro[1m]`,
  sonnet/haiku→`deepseek-v4-flash[1m]`. The claude binary inherits the
  settings default model (currently opus → pro slot = the expensive one), so
  **always pass `--model deepseek-v4-flash` explicitly** for cheap bulk runs;
  omit it only when you deliberately want pro.
- resume: full claude-binary flags — `-r/--resume <session-id>`,
  `--fork-session`; session id is in the `--output-format json` result.
- **`--output-format json` stdout is clean JSON** (session_id in the init
  message); warnings go to stderr. Capture with stderr separate — `> out.json
  2> err.log`, never `2>&1` (merging is what mangles the JSON). Last-resort
  recovery: claude-binary sessions land in `~/.claude/projects/<cwd-slug>/`,
  newest `.jsonl` filename = session id.
- The wrapper already sets `--permission-mode bypassPermissions`. Do NOT pass
  `--permission-mode` yourself — last flag wins and silently downgrades to a
  mode where non-edit tool calls get denied (no TTY in `-p` mode).
- Full Claude Code semantics — tools, hooks, skills, plugins all load.
  Includes **user-level hooks** (e.g. a personal Bash-intercept layer), which can
  shape the engine's internal tool calls — unlike cursor-agent/opencode/droid,
  which are standalone CLIs with no Claude Code hook stack. So: don't
  extrapolate dscode output quirks to other engines, and when chasing
  dscode/arkcode noise, the user hook stack is a suspect unique to them.
- Quota: DeepSeek billing, independent of the Anthropic 5h window.

## arkcode — claude binary, Volcengine Ark backend

Same mechanism, flags, and resume story as dscode; Ark-hosted models
(**model: fixed**), third independent quota pool. Failover when DeepSeek
throttles.

## opencode — volcengine coding plan backend

```bash
source ~/.zshenv && opencode run "<brief>" -m volcengine-plan/kimi-k2.7-code --format json --auto
source ~/.zshenv && opencode run -s <session-id> "<consolidated fix list>"   # resume for the fix round
```

- Provider/model config lives in `~/.config/opencode/opencode.json`.
- **model: selectable** — prefer `volcengine-plan/kimi-k2.7-code` or
  `volcengine-plan/glm-5.2` (same provider also carries deepseek/doubao/minimax
  ids if those two throttle).
- resume: `-s/--session <id>` (or `-c` for the latest, `--fork` to branch);
  the id is the `sessionID` field on every `--format json` event line.
- `--auto` required for unattended edits (auto-approves permissions).
- Quota: Volcengine Ark coding plan — independent of Anthropic and DeepSeek.

## cursor-agent

```bash
cursor-agent -p "<brief>" --output-format json --model composer-2.5 --force
cursor-agent --mode plan -p "<question>" --model composer-2.5      # read-only 勘察
cursor-agent -p --resume <chatId> "<consolidated fix list>"        # fix round
```

- **model: selectable** — daily default `composer-2.5`; hard tasks
  `grok-4.5-xhigh` (fast variant `grok-4.5-fast-xhigh`), `gpt-5.5-high`, or
  `claude-opus-4-8-thinking-high`. Re-check ids with `--list-models` when
  escalating (names rotate as Cursor ships models).
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
