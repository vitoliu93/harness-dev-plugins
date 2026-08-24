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

Read `${AGENTS_CONFIG:-$HOME/.config/agents/agents.json}`. Pick the requested
alias, then a route whose quota record is clear. The file shape and route order
are in [agent-config.md](references/agent-config.md).

## Start through Herdr

When `HERDR_ENV=1`, use Herdr by default. Give the agent its own tab so the user
can inspect and take over its context. Follow [herdr.md](references/herdr.md)
and return the agent name plus tab ID. Leave the tab open for the caller.

Outside Herdr, use the selected carrier sheet:

- [Claude Code](references/claude-code.md)
- [pi](references/pi.md)
- [cursor-agent](references/cursor-agent.md)

Agent definition locations: [agent-definitions.md](references/agent-definitions.md).
Quota state: [quota.md](references/quota.md).

## Boundary

Do not split work, invent roles, choose task order, judge completion, or close a
team of tabs. Load `orchestrate` for those decisions.
