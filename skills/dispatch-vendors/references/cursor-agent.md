# cursor-agent — Cursor Ultra subscription

Quota: Cursor subscription. The **workspace index** provides repo-wide localization without cold grep.

Default Q model: **`cursor-grok-4.5-high`**. Fast/light + vision: **`composer-2.5`**. Hard tier: **`gpt-5.6-sol-high`** when listed. Subagent model inside Cursor is composer-2.5 — hands-off.

```bash
cursor-agent --mode plan -p "<q>" --output-format stream-json --model cursor-grok-4.5-high --trust
cursor-agent -p "<brief>" --output-format stream-json --model cursor-grok-4.5-high --force
cursor-agent -p --resume <chatId> "<consolidated fix list>" --force
```

## Required flags

- **`--trust`** mandatory headless in untrusted directories — even plan mode. Without it: exit 0, empty stdout, trust prompt on stderr.

## Modes

- `--mode plan` — read-only analyze/propose
- `--mode ask` — read-only Q&A
- omit `--mode` — edits allowed (needs `--force`)

## Models

- Primary hard tier: `cursor-grok-4.5-high`
- Fast/light: `composer-2.5`
- Escalation: `gpt-5.6-sol-high`, `claude-opus-4-8-thinking-high`
- Names rotate — re-run `--list-models` before dispatch
- Parameterized: `--model 'claude-opus-4-8[context=1m,effort=high]'`
- Effort: prefer `-high` variants when exposed

## Output

- Use **`stream-json`**, never `json` (json flushes only at exit; process may hang after work completes).
- Line 1: `system`/`init` event with `session_id` (= chat id for `--resume`). Capture at launch.
- Plan mode deliverable: `createPlanToolCall` event `args.plan`, not `result` field.
- Final answer (ask/edit): `jq -r 'select(.type=="result").result'`
- Progress: `tail -3 | jq -c '.type'` — event mix is tool_call-heavy

## Vision

composer-2.5: supported. grok/gpt: per Cursor docs (confirm with `--list-models`).

## Worktree

Avoid `-w` headless — may hang before conversation. Create own `git worktree`, run with cwd inside it.

## Resume and filesystem

- `--resume <chatId>` · `--continue`
- `cursor-agent ls` is TUI-only — read `~/.cursor/chats/<hash>/<chatId>/` (`meta.json`, `store.db`)
- Hung run + fat store.db + stale meta → kill and `--resume` to harvest

## Other flags

- Edits: `-f/--force` (alias `--yolo`); `--auto-review` middle ground
- `-w/--worktree [name]` at `~/.cursor/worktrees/<repo>/<name>`
- `--workspace`, `--add-dir`
- `--sandbox enabled|disabled`, `--approve-mcps`
