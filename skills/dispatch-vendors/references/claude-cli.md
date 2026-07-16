# claude CLI (headless) — plus dscode / arkcode variants

Flags verified 2026-07-16 via `--help`; dscode/arkcode/session-resume verified
live same day.

```bash
claude -p "<brief>" --model sonnet --output-format json --bare > out.json 2> err.log
claude -p -r <session-id> "<consolidated fix list>"          # fix round
```

## The real claude — DO NOT use for bulk

Shares the interactive Anthropic 5h quota (same stored credentials, no
separate headless tier). Use only when the task genuinely needs Anthropic
models AND the main session must stay free. `--max-budget-usd <n>` caps spend.

## dscode / arkcode — same binary, foreign quota (the default cheap picks)

zsh **functions in `~/.zshrc`** over the claude binary, model slots remapped
to DeepSeek (dscode) / Volcengine Ark (arkcode) backends — two independent
quota pools, full Claude Code semantics (tools/hooks/skills all load).

```bash
zsh -ic 'dscode -p "<brief>" --model deepseek-v4-flash --output-format json'
zsh -ic 'arkcode -p "<brief>" --model opus --output-format json'   # opus slot → glm-5.2[1m]
```

- **Wrap in `zsh -ic '…'`** — they are `~/.zshrc` functions; a plain
  `source ~/.zshenv &&` shell gets command-not-found (verified: exit 127).
- **Always pass `--model` explicitly** — the binary inherits the settings
  default model (fable/opus), which the wrapper does NOT remap → hard error
  "model may not exist" on the foreign backend (verified live). Slots:
  dscode opus→`deepseek-v4-pro[1m]`, sonnet/haiku→`deepseek-v4-flash[1m]`;
  arkcode opus→`glm-5.2[1m]`, sonnet/haiku→`deepseek-v4-flash[1m]` (Ark-hosted).
  Full backend ids also accepted (e.g. `--model deepseek-v4-flash`).
- Wrapper already sets `--permission-mode bypassPermissions`. Do NOT pass
  `--permission-mode` yourself — last flag wins, silently downgrades, and
  non-edit tools then get denied (no TTY in `-p` mode).
- User-level hooks load in dscode/arkcode (unlike opencode/cursor-agent) —
  when chasing output noise, the hook stack is a suspect unique to them.

## Shared flags (all three)

- Run: `-p/--print`, prompt as positional arg or stdin.
- Model: `--model <alias|full-id>`, `--fallback-model <list>`, `--effort
  low|medium|high|xhigh|max`.
- Output: `--output-format text|json|stream-json`. With `json`, stdout is
  clean JSON (session id in the init message), warnings on stderr — redirect
  separately, never `2>&1`. Last-resort session-id recovery: newest `.jsonl`
  in `~/.claude/projects/<cwd-slug>/`.
- Resume: `-r/--resume <session-id>` · `-c/--continue` (latest in cwd) ·
  `--fork-session` (new id on resume) · `--session-id <uuid>` (force id).
- Unattended edits: `--permission-mode bypassPermissions` (real claude only;
  variants already set it).
- Tools: `--allowedTools/--disallowedTools "<list>"`, `--tools ""` disables all.
- Scope: `--add-dir <dirs>`, `--append-system-prompt <text>`.
- `--bare`: skips hooks/plugins/CLAUDE.md/auto-memory — reproducible runs, but
  auth falls back to `ANTHROPIC_API_KEY` only and all context must be passed
  explicitly. Good for the real claude; pointless for dscode/arkcode (their
  value includes the loaded ecosystem).
- No `--timeout` — wrap with shell `timeout` if needed.
