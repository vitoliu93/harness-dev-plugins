# cursor-agent — Cursor Ultra subscription

Flags verified 2026-07-16 via `--help` / `--list-models`. Quota: Cursor
subscription — plan-mode reads are the cheap way to spend it, premium models
the expensive way. Unique asset: Cursor's **workspace index** (fast, accurate
repo-wide localization without cold grep).

```bash
cursor-agent --mode plan -p "<question>" --output-format json --model composer-2.5 --trust   # read-only recon
cursor-agent -p "<brief>" --output-format json --model composer-2.5 --force
cursor-agent -p --resume <chatId> "<consolidated fix list>" --force    # fix round (edits need --force too)
```

**`--trust` is mandatory headless in any not-yet-trusted directory** — even
plan mode; without it the run dies on a Workspace Trust prompt (exit 0, empty
stdout, prompt text on stderr — verified live 2026-07-16).

- Modes: `--mode plan` (read-only: analyze/propose, no edits) · `--mode ask`
  (read-only Q&A) · omit `--mode` for edit-capable runs.
- Model: daily default `composer-2.5` (treat as sonnet-tier); premium
  escalation `cursor-grok-4.5-high(-fast)` (treat as opus-tier — verified:
  adversarial review with computed evidence), `gpt-5.5-high`,
  `claude-opus-4-8-thinking-high`; non-Anthropic diversity picks: grok/gpt
  families. **Names rotate** — re-run `--list-models` (cheap, ~2s) before
  escalating. Parameterized: `--model 'claude-opus-4-8[context=1m,effort=high]'`.
- **Plan-mode deliverable location**: with `--mode plan` + stream-json, the
  final report lands in the `createPlanToolCall` event's `args.plan` — the
  `result` field only carries progress narration (verified). Parse the
  tool_call, or skip plan mode when you want the answer in `result`.
- Output: **default to `stream-json` or `text`, avoid `json`** — `json` only
  flushes at process exit, and the process can finish the work yet never
  exit (verified: 20-min hang with a complete conversation on disk; the
  stream variant flushed 68 events fine on the same task class). Chat id in
  the JSON output; `create-chat` pre-allocates an id headlessly.
- **Vision: YES** on composer-2.5 (image transcription verified live);
  grok/gpt-5.5 support it per Cursor docs (unprobed). The fleet's primary
  vision engine alongside opencode doubao.
- **Avoid `-w` headless** — it created the worktree then hung before the
  conversation started (no chat dir ever appeared; verified). Make your own
  `git worktree` and run with cwd inside it instead.
- Resume: `--resume <chatId>` · `--continue` (latest). `cursor-agent ls` is
  TUI-only (crashes headless: "Raw mode is not supported") — to find/verify a
  session headlessly, read the filesystem instead:
  `~/.cursor/chats/<workspace-hash>/<chatId>/` (`meta.json` carries cwd +
  createdAtMs/updatedAtMs; `store.db` is the conversation). A hung `-p` run
  whose chat dir has stopped updating but has a fat store.db = work done,
  output never flushed → kill it and `--resume <chatId>` to harvest.
- Unattended edits: `-f/--force` (alias `--yolo`); middle ground
  `--auto-review`; `--trust` skips workspace-trust prompt (headless only).
- Isolation: `-w/--worktree [name]` = native git worktree at
  `~/.cursor/worktrees/<repo>/<name>`; `--worktree-base <branch>`.
- Scope: `--workspace <path>` (default cwd), `--add-dir <path>` repeatable.
- Sandbox/MCP: `--sandbox enabled|disabled`, `--approve-mcps`; no
  finer tool-restriction flag.
