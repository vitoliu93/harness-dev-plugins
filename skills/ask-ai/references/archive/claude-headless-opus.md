# [ARCHIVED] Claude headless on opus-4.8 — ultra stand-in while fable is away

> **Archived 2026-07-02 — fable temporarily returned (7-day window).** Ultra is
> back on fable; this opus-4.8 @ max guide is the stand-in for when fable lapses
> (~2026-07-09). **To restore:** move this file back to `../claude-headless.md`
> (overwriting the fable guide), and in `SKILL.md` + `agents/ai-second-opinion.md`
> swap ultra's engine from `--model fable` to `--model opus --effort max`.

---

# Claude Code headless operations (`ultra` mode)

Drive a fresh Claude Code process non-interactively on **opus 4.8** at `max` effort — the deepest Claude-family pass, in a wholly separate clean context (one isolation level beyond the `opus` subagent mode). In `-p`/`--print` mode stdout is just the final answer text — no banner noise.

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
