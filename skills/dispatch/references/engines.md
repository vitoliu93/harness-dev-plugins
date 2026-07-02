# Engine cards

Verified 2026-07-02 on this machine. One card per engine: invocation, model
control, quota pool, quirks.

## dscode — claude binary, DeepSeek backend

```bash
dscode -p "<brief>" --output-format json
```

- zsh function (`~/.config/zsh/utils.sh`) wrapping `openclaude`: re-execs the
  real `claude` binary with `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`.
- The wrapper already sets `--permission-mode bypassPermissions`. Do NOT pass
  `--permission-mode` yourself — last flag wins, so you'd silently downgrade to
  a mode where non-edit tool calls get denied (no TTY to prompt in `-p` mode).
- Model slots remapped: opus→`deepseek-v4-pro[1m]`, sonnet/haiku→`deepseek-v4-flash[1m]`.
- **Full Claude Code semantics** — tools, hooks, skills, plugins all load. Your
  whole plugin ecosystem works inside it.
- Quota: DeepSeek billing, fully independent of the Anthropic 5h window.
- Cheapest per-token Claude-shaped executor → default for bulk implementation.

## arkcode — claude binary, Volcengine Ark backend

Same mechanism as dscode, Ark-hosted models, third independent quota pool.
Failover target when DeepSeek throttles.

## droid — Factory CLI

```bash
droid exec -o json -m <model> --auto low -w "<brief>"     # or -f brief.txt
```

- `-m/--model` (default claude-opus-4-8), `--auto low|medium|high` autonomy.
- `-w` = native worktree isolation; `--mission` mode exists for its own
  multi-agent orchestration (`--worker-model`/`--validator-model`).
- Quota: Factory account. `--auto low` for unattended safety.

## cursor-agent

```bash
cursor-agent -p "<brief>" --output-format json --model <model> --force
```

- `--force`/`--yolo` required for unattended edits; `--mode plan` = read-only
  planning pass using Cursor's workspace index. `--list-models` to enumerate.
- Quota: Cursor subscription.

## codex — OpenAI

```bash
codex exec -m <model> "<brief>"
```

- `codex exec review` is purpose-built for one-shot diff review — the go-to
  cross-family reviewer. Config overrides via `-c key=value`.
- Quota: OpenAI account.

## gemini

```bash
gemini -p "<brief>" -m <model> -o json --approval-mode yolo
```

- Large context window; good for cheap long-document digestion.
- Quota: Google account.

## claude — the real one (DO NOT use for bulk)

```bash
claude -p "<brief>" --model sonnet --output-format json --bare
```

- Shares the interactive 5h quota (verified: same stored credentials, no
  separate headless tier). Only use headless-real-claude when the task
  genuinely needs Anthropic models AND the main session must stay free —
  e.g. ask-ai ultra mode. `--bare` skips hooks/skills for reproducibility.
