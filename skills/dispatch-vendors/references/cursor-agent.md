# cursor-agent — Cursor Ultra subscription

Quota: Cursor subscription. The **workspace index** provides repo-wide localization without cold grep.

Slot models per manifest role (`hard` / `default_q` / `fast_light`). The subagent model inside Cursor is the fast_light slot — hands-off.

```bash
cursor-agent --mode plan -p "<q>" --output-format stream-json --model <default_q slot> --trust
cursor-agent -p "<brief>" --output-format stream-json --model <default_q slot> --force
cursor-agent -p --resume <chatId> "<consolidated fix list>" --force
```

## Required flags

- **`--trust`** mandatory headless in untrusted directories — even plan mode. Without it: exit 0, empty stdout, trust prompt on stderr.

## Modes

- `--mode plan` — read-only analyze/propose
- `--mode ask` — read-only Q&A
- omit `--mode` — edits allowed (needs `--force`)

## Models

- Slot models live in the vendor manifest; names rotate — re-run `--list-models` before dispatch and reconcile the manifest when they change.
- Parameterized (example): `--model 'claude-opus-4-8[context=1m,effort=high]'`
- Effort: prefer `-high` variants when exposed

## Output

- Use **`stream-json`**, never `json` (json flushes only at exit; process may hang after work completes).
- Line 1: `system`/`init` event with `session_id` (= chat id for `--resume`). Capture at launch.
- No line 1 within seconds = dead launch (network/TLS layer) — read stderr, relaunch. Mid-run drops self-heal (`connection/reconnecting` → `reconnected`); tool failures right after a reconnect resolve on retry.
- Plan mode deliverable: `createPlanToolCall` event `args.plan`, not `result` field.
- Final answer (ask/edit): `jq -r 'select(.type=="result").result'`
- Progress: `tail -3 | jq -c '.type'` — event mix is tool_call-heavy

## Vision

Per slot — check the manifest `capabilities`/`note`; confirm with `--list-models`.

## Worktree

Avoid `-w` headless — may hang before conversation. Create own `git worktree`, run with cwd inside it.

## Background processes

Shell-tool background jobs (`&`, `nohup`) die with the tool call. Brief the vendor to run long-lived processes (dev servers) in a persistent background shell and verify liveness with an HTTP probe, not the spawn's exit code.

## Resume and filesystem

- `--resume <chatId>` · `--continue`
- `cursor-agent ls` is TUI-only — read `~/.cursor/chats/<hash>/<chatId>/` (`meta.json`, `store.db`)
- Hung run + fat store.db + stale meta → kill and `--resume` to harvest

## Other flags

- Edits: `-f/--force` (alias `--yolo`); `--auto-review` middle ground
- `-w/--worktree [name]` at `~/.cursor/worktrees/<repo>/<name>`
- `--workspace`, `--add-dir`
- `--sandbox enabled|disabled`, `--approve-mcps`
