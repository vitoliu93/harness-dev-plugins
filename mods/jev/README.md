# dev-kit-jev

A Claude Code Mod. On each prompt you type it asks Jev two things — should the
main agent delegate, and which past sessions are worth re-reading — and adds the
answer as hidden context. Advice only: it never starts an agent.

Claude Code only. Codex ignores this directory.

## Load and switch on

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 TYPESAFE_API_KEY=... DEVKIT_JEV_ENABLED=1 \
  claude --plugin-dir <checkout-path>/mods/jev
```

It stays off until both a switch and a key are present, so loading it alone
changes nothing. The switch is either `DEVKIT_JEV_ENABLED=1` or the `enabled`
option; the key is either `TYPESAFE_API_KEY` or the `apiKey` option. Options go
in user or `--settings` settings under `pluginConfigs["dev-kit-jev"].options`
(project settings are not read):

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Master switch. |
| `apiKey` | — | TypeSafe key. Prefer the environment variable. |
| `model` | `jev-1.13.0` | TypeSafe model version. |
| `timeoutMs` | `3000` | Extra time budget per prompt, clamped to 200–8000. |

## What the model sees

One `<jev-routing>` block with `self` / `delegate` / `unknown` plus up to two
agent aliases and their routes, and — only when something matched — a
`<session-precedents>` block with up to three past sessions and their transcript
paths. No candidates at all means nothing is injected. Both blocks say in plain
words that they are advice and untrusted data; your instructions, `orchestrate`
team order and `use-agents` quota checks still win.

## What leaves this machine

Sent: the current prompt (≤3000 chars), the last four user/assistant messages
(≤800 chars each), agent aliases with their descriptions, and ccobs summaries.
Never sent: tool output, file contents, local paths, route definitions and any
string matching a key shape — redaction runs before truncation
(`hooks/core.ts:10-21`), and the whole request is capped at 40 KB.

Candidates come from `~/.claude/observability/agents/agents.json` (aliases whose
route is not rate-limited) and from obs.db, read through a separate read-only
process (`scripts/recall-candidates.ts`). `CCOBS_DIR` and `AGENTS_CONFIG`
override both for testing.

## Legacy recall

While this Mod owns a session it sets `DEVKIT_JEV_RECALL_SESSION`, and
`hooks/scripts/recall-precedent.ts` returns without doing anything — one recall
per turn, never two. Ownership starts as soon as the Mod is on with a key, even
if the Jev call then fails, so a failure does not fall through to a second model
call. Codex, other sessions and sessions without the Mod keep the old path.

## When it breaks

Timeout, HTTP error, bad response, missing obs.db, missing catalogue: the prompt
goes through unchanged and a line lands in the debug log only. The prompt is
never dropped or edited, and `next()` is called exactly once.

## Check it is working

```bash
claude --plugin-dir <checkout-path>/mods/jev --debug-file /tmp/jev.log ...
rg 'dev-kit-jev' /tmp/jev.log
```

Look for `hooks module dev-kit-jev@inline loaded ... events: prompt.submit`
(loaded), `dev-kit-jev: self; 0 agent suggestion(s), 1 reference(s)` (a decision
came back) and `prompt.submit settled in ...ms` (what it cost you).

## Live check against the real API

```bash
TYPESAFE_API_KEY=... bun mods/jev/scripts/live-eval.ts
```

Eight fictional cases — fictional agents, fictional history, fictional prompts.
It prints one line per case plus a p50. Nothing from your own sessions is sent.
Small sample: it shows the wiring works, not an accuracy or latency guarantee.
