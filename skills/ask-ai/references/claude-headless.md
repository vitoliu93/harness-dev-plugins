# Claude Code headless operations (`ultra` mode)

Drive a fresh Claude Code process non-interactively on **fable** (the strongest available model). In `-p`/`--print` mode stdout is just the final answer text — no banner noise.

> **Fable is a 7-day temporary return (2026-07-02, expires ~2026-07-09).** When it
> lapses, revert to the opus-4.8 stand-in at `archive/claude-headless-opus.md`: move
> that file back over this one, and in `SKILL.md` + `agents/ai-second-opinion.md` swap
> ultra's engine from `--model fable` to `--model opus`.

## Basic shape

```bash
ans=$(mktemp -t claude_answer.XXXXXX)
claude -p --model fable --effort <effort> "<self-contained brief>" > "$ans"
# then Read "$ans"
```

- `<effort>`: `low` / `medium` / `high` / `xhigh` — passed in by the caller (see SKILL.md). Avoid `max`: too expensive for its marginal gain.
- `--model fable` resolves to `claude-fable-5`. If the caller names a different model, use that.

## Long prompts — stdin

```bash
# 1. Write the brief with the Write tool to /tmp/claude_prompt_$$.txt
ans=$(mktemp -t claude_answer.XXXXXX)
claude -p --model fable --effort <effort> < /tmp/claude_prompt_$$.txt > "$ans"
```

## Repo context

Run from the relevant repo root (`cd <repo> && claude -p ...`) — the headless session is a full agentic loop with its own Read/Grep/Bash tools, so the brief can reference file paths and let the reviewer explore. Write tools are permission-gated and effectively unavailable in headless default mode, which is exactly right for a reviewer.

## Latency and timeouts

Fable at `xhigh` on a real review can run several minutes. Set the Bash tool timeout to the maximum (`timeout: 600000`), or use `run_in_background: true` and collect the output file when the process exits. Do not kill a run just because it is slow.

## Do NOT use

- `--bare` — it restricts auth to `ANTHROPIC_API_KEY` only (OAuth/keychain never read) and will fail on subscription-authenticated machines.
- `--dangerously-skip-permissions` — a reviewer needs no write access.
