---
name: use-agents
description: >-
  Start an independent AI agent and show where its local definition lives.
  Use when you need a launch command, agent definition, model route, or CLI/provider warning.
argument-hint: "[agent alias | list | definition | launch]"
metadata:
  kind: sop
---

# use-agents

An agent is a separate process with its own context. Built-in subagents and CLI
agents differ in transport, not in purpose.

## Read the local routes

Read `${AGENTS_CONFIG:-${CCOBS_DIR:-$HOME/.claude/observability}/agents/agents.json}`.
Pick the requested alias, then a route whose quota record is clear. The file
shape and route order are in [agent-config.md](references/agent-config.md).

## Start through Herdr

Use Herdr by default, including when the caller is outside Herdr. Give the agent
its own new tab so the user can inspect and take over its context. Follow
[herdr.md](references/herdr.md) and return the agent name plus tab ID. Leave the
tab open for the caller. If Herdr is unavailable, stop with the error; do not
silently switch transports.

Only when the user chooses a non-Herdr transport, use the selected carrier
sheet:

- [Claude Code](references/claude-code.md)
- [pi](references/pi.md)
- [cursor-agent](references/cursor-agent.md)

Agent definition locations: [agent-definitions.md](references/agent-definitions.md).
Quota state: [quota.md](references/quota.md).

## Wait for the result

Wait through the official status: `herdr agent prompt --wait` or `herdr agent
wait`, always with `--timeout`. `--wait` does not track turns, and `unknown` is
not a finished run. On `blocked`, read `herdr agent get` / `herdr agent read`
before deciding what to send next.

Agree on a result file at launch: the agent writes its conclusion to a markdown
file in a temp dir and replies with the path only. Read the file, not the screen
(a full-screen agent's alternate screen never shows the whole answer).

Herdr has no push notification. `notification` is a local popup; `integration`
is the agent reporting to Herdr. To be woken up, run your own background watch
over the result file, the status, and a timeout floor - and make it actually
wake the main task.

## Boundary

Do not split work, invent roles, choose task order, judge completion, or close a
team of tabs. Load `orchestrate` for those decisions.
