# Claude Code headless operations (`ultra` mode — Claude leg)

Drive a fresh Claude Code process non-interactively on **opus 4.8** at `max` effort — the deepest Claude-family pass, in a wholly separate clean context (one isolation level beyond the `opus` subagent mode). In `-p`/`--print` mode stdout is just the final answer text — no banner noise.

> **Fable is temporarily suspended (2026-06-13).** Ultra's Claude leg normally ran on fable (the strongest model); until it returns, opus 4.8 @ max stands in. The original fable guide is preserved verbatim at `archive/claude-headless-fable.md` — restore it (and revert `--model opus` → `--model fable`) when fable is back. Ultra's other leg, gpt-5.5 @ xhigh, is in `codex-cli.md`.

## Basic shape

```bash
ans=$(mktemp -t claude_answer.XXXXXX)
claude -p --model opus --effort max "<self-contained brief>" > "$ans"
# then Read "$ans"
```

- `--effort max` is ultra's setting — the deepest pass, exclusive to this mode. The flag also accepts `low` / `medium` / `high` / `xhigh` if the caller dials it down.
- `--model opus` resolves to the current Opus (`claude-opus-4-8`). If the caller names a different model, use that.

## Long prompts — stdin

```bash
# 1. Write the brief with the Write tool to /tmp/claude_prompt_$$.txt
ans=$(mktemp -t claude_answer.XXXXXX)
claude -p --model opus --effort max < /tmp/claude_prompt_$$.txt > "$ans"
```

## Repo context

Run from the relevant repo root (`cd <repo> && claude -p ...`) — the headless session is a full agentic loop with its own Read/Grep/Bash tools, so the brief can reference file paths and let the reviewer explore. Write tools are permission-gated and effectively unavailable in headless default mode, which is exactly right for a reviewer.

## Latency and timeouts

Opus at `xhigh`/`max` on a real review can run several minutes. Set the Bash tool timeout to the maximum (`timeout: 600000`), or use `run_in_background: true` and collect the output file when the process exits. Do not kill a run just because it is slow — slow is what `max` buys.

## Do NOT use

- `--bare` — it restricts auth to `ANTHROPIC_API_KEY` only (OAuth/keychain never read) and will fail on subscription-authenticated machines.
- `--dangerously-skip-permissions` — a reviewer needs no write access.
