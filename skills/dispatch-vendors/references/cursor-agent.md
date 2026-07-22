# cursor-agent — Cursor Ultra subscription

Flags verified 2026-07-16 via `--help` / `--list-models`. Quota: Cursor
subscription — plan-mode reads are the cheap way to spend it, premium models
the expensive way. Unique asset: Cursor's **workspace index** (fast, accurate
repo-wide localization without cold grep).

**Fleet primary vendor (2026-07-22 quota economics)** — Ultra quota is huge
and mostly unspent (user console), while kicode's Kimi quota is small: default
dispatches land here on **`cursor-grok-4.5-high`** as the main model, with
`composer-2.5` as its subagent model (Cursor delegates subagents internally —
hands-off, don't configure it). Trade-off: sub-1M ctx (composer ≈270k
user-reported; vs k3's 1M) — acceptable, auto-compaction covers long runs.
For **fast/light tasks**, `composer-2.5` as the main model is the first pick
(vision-capable — its edge over deepseek), with dscode as the backup vendor
for that tier. Scale performance under observation via the dispatch ledger.

```bash
cursor-agent --mode plan -p "<q>" --output-format stream-json --model cursor-grok-4.5-high --trust  # read-only recon
cursor-agent -p "<brief>" --output-format stream-json --model cursor-grok-4.5-high --force
cursor-agent -p --resume <chatId> "<consolidated fix list>" --force    # fix round (edits need --force too)
```

**`--trust` is mandatory headless in any not-yet-trusted directory** — even
plan mode; without it the run dies on a Workspace Trust prompt (exit 0, empty
stdout, prompt text on stderr — verified live 2026-07-16).

- Modes: `--mode plan` (read-only: analyze/propose, no edits) · `--mode ask`
  (read-only Q&A) · omit `--mode` for edit-capable runs.
- Model: primary `cursor-grok-4.5-high` (treat as opus-tier — verified:
  adversarial review with computed evidence); `composer-2.5` is the subagent
  model (sonnet-tier; Cursor delegates internally — hands-off). **Effort:
  always high** — pick the `-high` variant whenever the roster exposes one
  (grok's name encodes it; composer-2.5 lists no effort tiers). Other
  escalations: GPT pick is `gpt-5.6-sol-high` (1M; **not gpt-5.5**),
  `claude-opus-4-8-thinking-high`; non-Anthropic
  diversity picks: grok/gpt families. **Names rotate** — re-run
  `--list-models` (cheap, ~2s; names re-verified 2026-07-22). Parameterized:
  `--model 'claude-opus-4-8[context=1m,effort=high]'`.
- **Plan-mode deliverable location**: with `--mode plan` + stream-json, the
  final report lands in the `createPlanToolCall` event's `args.plan` — the
  `result` field only carries progress narration (verified). Parse the
  tool_call, or skip plan mode when you want the answer in `result`.
- Output: **`stream-json` is the default; never `json`** — `json` only
  flushes at process exit, and the process can finish the work yet never
  exit (verified: 20-min hang with a complete conversation on disk). No
  `--verbose` needed here (that's a claude-binary requirement);
  `--stream-partial-output` adds text deltas — noise, skip it.
  - **Line 1 IS the `system`/`init` event, carrying `session_id`** (=the
    chat id for `--resume`) — verified live 2026-07-22, arrives within
    ~15s. Capture at launch; it survives a kill, `json`'s does not.
    (`create-chat` also pre-allocates an id headlessly.)
  - Per-event flush on a redirected file verified same run: 0 → 8.5KB/10
    lines → 33KB/40 → 56KB/63, continuous. Event mix is
    `tool_call`-dominated (42 of 63) with `thinking`/`assistant` interleaved,
    so `tail -3 | jq -c '.type'` reads as real progress.
  - Final answer: `jq -r 'select(.type=="result").result'` — populated in
    ask/edit modes. **Plan mode is the exception**, see below.
- **Vision: YES** on composer-2.5 (image transcription verified live);
  grok/gpt-5.5 support it per Cursor docs (unprobed). The fleet's primary
  vision engine (kicode k3 the other verified cell).
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
