# claude — Claude Code itself as a carrier

Shares the host's Anthropic pool, so it saves no quota. Dispatch here for a
second pair of eyes with a clean context, for work that needs Anthropic models
specifically, or as the last stop when every foreign carrier failed.

```bash
F='--output-format stream-json --verbose'   # --verbose required with -p
claude -p '<brief>' --model <slot> --effort <level> $F
claude -p -r <session-id> "<consolidated fix list>"
```

## Launch

- Bare binary on PATH. Inside Herdr: `pane split --cwd <repo>` →
  `pane run 'export PROMPT_FORGE=0'` → `agent start <name> --kind claude --pane <id>`.
- **`export PROMPT_FORGE=0` in the pane before launch.** A claude-family vendor
  inherits the host `UserPromptSubmit` hook; the brief is already the complete
  instruction and must not be rewritten on the way in.
- Always pass `--model` explicitly.
- `--max-budget-usd <n>` caps spend on a long run.

## Effort

`--effort low|medium|high|xhigh|max`, chosen per task, never below the manifest
`effort_policy.floor`. Advisory dispatch runs high or above.

## Permissions

Runs inherit the user's `defaultMode: auto`. Unattended runs need
`--permission-mode bypassPermissions`, and therefore their own worktree.

User-level hooks and skills load here (unlike cursor-agent) — enumerate that
inherited surface before a sensitive dispatch.

## Flags

- Run: `-p/--print`, prompt positional or stdin.
- Model: `--model`, `--fallback-model`, `--effort`.
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
- No built-in `--timeout`; use background run + monitor or `gtimeout` if installed.
