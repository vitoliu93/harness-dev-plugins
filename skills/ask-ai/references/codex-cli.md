# Codex CLI operations (`codex` mode)

Drive OpenAI's Codex CLI non-interactively via the Bash tool. **Never rely on codex's stdout** — Bash background mode swallows it, and it is full of banner/token-count noise. Capture the answer with `--output-last-message` and Read the file.

## Basic shape

```bash
ans=$(mktemp -t codex_answer.XXXXXX)
codex --model 'gpt-5.5' -c model_reasoning_effort="<effort>" exec --skip-git-repo-check --output-last-message "$ans" "<self-contained brief>"
# then Read "$ans"
```

- `<effort>`: `minimal` / `low` / `medium` / `high` / `xhigh` — passed in by the caller (see SKILL.md effort rubric).
- `mktemp` guarantees a unique path — safe with concurrent sessions.
- `--skip-git-repo-check` must appear **after** `exec`, not before.

## Long prompts — stdin from a file

Heredoc-as-argument is fragile: in bg mode codex sometimes silently exits without sending the prompt. Write the brief to a file and pipe via stdin:

```bash
# 1. Write the brief with the Write tool to /tmp/codex_prompt_$$.txt
ans=$(mktemp -t codex_answer.XXXXXX)
codex --model 'gpt-5.5' -c model_reasoning_effort="<effort>" exec --skip-git-repo-check --output-last-message "$ans" - < /tmp/codex_prompt_$$.txt
# 2. Read "$ans"
```

Trailing `-` tells codex to read the prompt from stdin.

## Other useful flags (see `codex exec --help`)

- `-C <dir>` — set working directory if codex needs repo context.
- `-i <image>` — attach an image (e.g., a screenshot of a failing render).
- `--json` — stream events as JSONL for programmatic parsing.
- `--search` — enable live web search; usually unnecessary, codex searches on its own.

## Concurrency

Codex CLI talks to a single shared `Codex.app` `app-server` daemon. Measured (2026-04-27): **~2 concurrent calls run in parallel; the 3rd queues silently** — no error, just longer wall time. Batch in groups of ≤2.

## Failure recovery — hung process or 0-byte answer

Symptoms of a stuck `app-server`:

- codex process running > 2 min with `ps -o time` showing CPU time ≈ 0
- `lsof -p <codex_pid>` shows no `ESTAB` network connections
- codex holds a lock under `~/.codex/tmp/arg0/codex-arg0*/.lock`

Recovery:

```bash
# 1. Kill the stuck CLI
pgrep -f "codex --model" | xargs kill

# 2. If hangs persist, the long-running app-server is likely wedged. Check uptime:
ps -o pid,etime,command -p $(pgrep -f "Codex.app.*app-server" | head -1)
#    If etime is many hours/days AND the CLI keeps hanging, kill it (auto-relaunches):
pgrep -f "Codex.app.*app-server" | xargs kill

# 3. Retry.
```

**If the `--output-last-message` file is empty but codex exited cleanly:** the prompt likely never reached the API. Check `~/.codex/sessions/$(date +%Y/%m/%d)/` — if no fresh `rollout-*.jsonl` exists, switch to the stdin-from-file pattern.

## Models

`--model` accepts whatever the user's codex install supports; defaults come from `~/.codex/config.toml`. `gpt-5.5` is the current go-to. If the caller names a different codex model (e.g. a newer `gpt-6`), use that instead. `codex exec --help` lists flags.
