# claude-binary variants (headless) — dscode / arkcode / kicode

One `claude` binary, three shell **functions** in `${VENDOR_SHELL_RC:-$HOME/.zshrc}` remapping to foreign quota pools via `ANTHROPIC_BASE_URL` + model-slot envs. Full Claude Code semantics (tools/hooks/skills load).

```bash
F='--output-format stream-json --verbose'   # --verbose required with -p
zsh -ic "dscode  -p '<brief>' --model <slot> $F"
zsh -ic "arkcode -p '<brief>' --model <slot> $F"
zsh -ic "kicode  -p '<brief>' --model <slot> $F"
zsh -ic 'kicode  -p -r <session-id> "<consolidated fix list>"'
```

## Launch

- Wrap in `zsh -ic '…'` — variants are rc functions; plain `source ~/.zshenv &&` often yields command-not-found.
- Always pass `--model` explicitly. Re-read slot maps from `${VENDOR_SHELL_RC:-$HOME/.zshrc}` when unsure.

## Model slots

Slot maps are defined per machine in `${VENDOR_SHELL_RC:-$HOME/.zshrc}` and
must be recorded in the vendor manifest (schema:
[vendor-manifest.schema.md](vendor-manifest.schema.md)). This sheet keeps only
the mechanics: which variant is text-only, which kills on images, which is 1M /
vision. Re-read the rc slot maps when unsure. Full backend ids are also
accepted (`--model deepseek-v4-flash`).

## Permissions

Wrappers do not set `bypassPermissions`. Runs inherit user `defaultMode: auto`; classifier runs on vendor backend — pass `--permission-mode bypassPermissions` for unattended runs when needed.

User-level hooks load in these variants (unlike cursor-agent).

## Vision and media fallback

| variant | vision | image in brief |
|---|---|---|
| kicode × k3 | supported | direct |
| dscode | graceful reject | route via media-understanding script |
| arkcode | fatal 400 | must use media-understanding script first |

Text-only path: load `media-understanding`, set `MEDIA_SKILL_DIR=${CLAUDE_SKILL_DIR}`, run:

```bash
"$MEDIA_SKILL_DIR/scripts/gemini_media.py" <file> [--audio-only] [--question "Q"]
```

Requires `GEMINI_API_KEY` under `zsh -ic`. Script handles PNG/JPG too.

## Real claude — off-roster for bulk

Shares interactive Anthropic 5h quota. Use only when task needs Anthropic models and main session must stay free. `--max-budget-usd <n>` caps spend.

Sanctioned advisory use: `claude -p --model fable --effort high` — see `advisory.md`.

## Flags (all three)

- Run: `-p/--print`, prompt positional or stdin.
- Model: `--model`, `--fallback-model`, `--effort low|medium|high|xhigh|max`.
- Output: default **`stream-json --verbose`**. stderr separate — never `2>&1`.
  - Capture session id early: `jq -r 'select(.session_id).session_id' out.jsonl | head -1` (hooks may precede `init`).
  - Per-event flush on redirected file — use growing line count as liveness signal.
  - Final answer: `jq -r 'select(.type=="result").result' out.jsonl`.
- Heartbeat: `wc -l out.jsonl` twice for alive; `tail -3 out.jsonl | jq -c '.type'` only when suspicious.
- Never Read/cat whole `.jsonl` into main context.
- Session id recovery: `--session-id $(uuidgen)` if missed; do not pick "newest jsonl" (orchestrator transcript may be newest).
- Resume: `-r/--resume <id>` · `-c/--continue` · `--fork-session` · `--session-id <uuid>`.
- Tools: `--allowedTools/--disallowedTools`, `--tools ""` disables all.
- Scope: `--add-dir`, `--append-system-prompt`.
- `--bare` skips hooks/plugins — pointless for variants.
- No built-in `--timeout`; use background run + monitor or `gtimeout` if installed.
