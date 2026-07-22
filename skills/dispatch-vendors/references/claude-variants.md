# claude-binary variants (headless) — dscode / arkcode / kicode

One `claude` binary, three `~/.zshrc` **functions** remapping it to foreign
quota pools via `ANTHROPIC_BASE_URL` + model-slot envs. Full Claude Code
semantics (tools/hooks/skills all load). dscode/arkcode verified 2026-07-16;
kicode verified and slot maps re-read from `~/.zshrc` 2026-07-22.

```bash
F='--output-format stream-json --verbose'   # --verbose is mandatory with -p
zsh -ic "dscode  -p '<brief>' --model deepseek-v4-flash $F"
zsh -ic "arkcode -p '<brief>' --model opus $F"   # opus slot → glm-5.2[1m]
zsh -ic "kicode  -p '<brief>' --model opus $F"   # every slot → k3[1m]
zsh -ic 'kicode  -p -r <session-id> "<consolidated fix list>"'    # fix round
```

- **Wrap in `zsh -ic '…'`** — they are `~/.zshrc` functions; a plain
  `source ~/.zshenv &&` shell gets command-not-found (verified: exit 127).
- **Always pass `--model` explicitly** — one uniform discipline across the
  three. Slot maps (read from `~/.zshrc` 2026-07-22; full backend ids also
  accepted, e.g. `--model deepseek-v4-flash`):
  - **dscode**: opus/fable/sonnet → `deepseek-v4-pro[1m]`, haiku + subagent →
    `deepseek-v4-flash[1m]`; effort=max.
  - **arkcode**: opus/fable → `glm-5.2[1m]`, sonnet/haiku/subagent →
    `deepseek-v4-flash[1m]` (Ark-hosted); effort=max.
  - **kicode**: every slot → `k3[1m]` (`ANTHROPIC_MODEL` also set, so bare
    works too — pass `--model` anyway for uniformity); effort=high, 1M ctx.
- **Permissions: the wrappers do NOT set `bypassPermissions`** (re-read
  2026-07-22 — the old sheet's claim was stale). Runs inherit user settings
  `defaultMode: auto`; the auto classifier executes on the vendor backend, so
  a degraded backend fails permission checks mid-run (observed live when k3
  was temporarily down). For classifier-independent unattended runs, pass
  `--permission-mode bypassPermissions` yourself.
- User-level hooks load in these variants (unlike cursor-agent) — when
  chasing output noise, the hook stack is a suspect unique to them.

## Vision & the media-understanding fallback

- **kicode × k3[1m]: vision YES** (2026-07-22: PNG transcription exact —
  text, shapes, colors, via the api.kimi.com/coding Anthropic endpoint).
- **dscode (deepseek): NO, graceful** — Read rejects the image in-run, agent
  can still reply.
- **arkcode (glm): NO, fatal** — image block reaches Ark API → 400 "Model
  only support text input", whole run errors. Never put an image in an
  arkcode brief.
- **Text-only variants stay eligible for image/audio/video tasks** — the
  brief routes the file through the media-understanding script (Gemini →
  text), the vendor reasons over the returned text. Verified e2e 2026-07-22:
  dscode + PNG → exact transcription via this path. Two rules:
  - Name the **exact script path** in the brief:
    `~/.agents/skills/media-understanding/scripts/gemini_media.py <file>
    [--audio-only] [--question "Q"]` — a bare "use the media-understanding
    skill" cost the vendor ~8 turns of find/ls hunting (same e2e).
  - The script takes images too, not just audio/video (PNG probe 2026-07-22).
  - Needs `GEMINI_API_KEY` — present under `zsh -ic` (zshenv).

## The real claude — off-roster, DO NOT use for bulk

不上名单,留档备查:shares the interactive Anthropic 5h quota (same stored
credentials, no separate headless tier). Use only when the task genuinely
needs Anthropic models AND the main session must stay free.
`--max-budget-usd <n>` caps spend.

## Shared flags (all three)

- Run: `-p/--print`, prompt as positional arg or stdin.
- Model: `--model <alias|full-id>`, `--fallback-model <list>`, `--effort
  low|medium|high|xhigh|max` (wrappers already pin effort via env).
- Output: **default to `stream-json --verbose`** (`--verbose` is required
  alongside it under `-p`). Warnings go to stderr — redirect separately,
  never `2>&1`. Why it beats `json`:
  - **Line 1 is the `init` event carrying `session_id` — capture it at
    launch.** With `json` nothing is written until exit, so a killed or hung
    run loses the id too, and `-r` fix rounds become impossible on exactly
    the runs that need them.
  - Per-event flush is real on a redirected regular file, not a TTY illusion
    (measured live: 20KB→71KB across ~16s mid-run, well before exit). So
    growing line count = a genuine liveness signal.
  - Surfaces `hook_started`/`hook_response` — free observability into the
    hook stack, a noise suspect unique to these variants.
  - Final answer is byte-identical to `json`'s:
    `jq -r 'select(.type=="result").result' out.jsonl`.
- **Heartbeat has two tiers — pick deliberately, and never poll on a timer.**
  A background run costs zero while it runs (the harness notifies on exit);
  every check you initiate costs a full turn at current context size.
  - alive? → `wc -l out.jsonl` twice, compare. ~0 tokens.
  - on track? → `tail -3 out.jsonl | jq -c '.type, .message.content[]?.name?'`.
    A full turn plus a few k. Only when genuinely suspicious or asked.
- **Never `cat`/`head`/Read the whole `.jsonl`.** The redirect keeps megabytes
  out of context only if you don't pull them back in yourself.
- Session-id recovery if line 1 was missed: force it instead —
  `--session-id $(uuidgen)`. Do NOT use "newest `.jsonl` in
  `~/.claude/projects/<cwd-slug>/`": the orchestrator's OWN transcript lives
  in that same directory and is usually the newest file (verified).
- Resume: `-r/--resume <session-id>` · `-c/--continue` (latest in cwd) ·
  `--fork-session` (new id on resume) · `--session-id <uuid>` (force id).
- Tools: `--allowedTools/--disallowedTools "<list>"`, `--tools ""` disables all.
- Scope: `--add-dir <dirs>`, `--append-system-prompt <text>`.
- `--bare`: skips hooks/plugins/CLAUDE.md/auto-memory — pointless for the
  variants (their value includes the loaded ecosystem).
- No `--timeout` — and macOS has no `timeout(1)` either (verified 2026-07-22:
  exit 127, two dead runs); run bare with `run_in_background` + monitor, or
  `gtimeout` if coreutils installed.
