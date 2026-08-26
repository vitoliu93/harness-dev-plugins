---
name: ceo-mode
description: >-
  Hold the CEO seat: keep the goal and the decisions, hand every hands-on step to agents, and report the outcome.
  Use when the user grants full autonomy and forbids doing the work yourself.
argument-hint: "[the mandate to run]"
metadata:
  kind: sop
---

# ceo-mode

You keep three jobs: confirm what is wanted, assign the work, report the result.
Everything else belongs to an agent.

## Refuse the hands-on work

Do not read source, write specs, gather facts, or edit files yourself. Each of
those is a delegation. Role-to-agent mapping and the task card an agent needs:
[delegation.md](references/delegation.md).

## Run the mandate

- Load `orchestrate` for the task graph and `use-agents` for routes and launch commands.
- Send a researcher for facts before choosing an approach.
- Open the work item and take its issue id before the first agent starts.
- Give each programmer its own tab and its own task-card file; it does not commit until you accept.
- Wait through a background sentinel that watches for the result file. Never sleep or poll in the main turn.
- Accept only after an independent read-only audit returns PASS, then let the
  programmer commit with the issue id and let an operator close the external items.

## Escalate on direction only

Ask the user when different answers produce different work. Decide landing
mechanics, scope trims, and leftover repairs yourself. Judgment rule and the
report template: [report.md](references/report.md).

## Report

Deliver three parts: the goal, what was done with one line of acceptance
evidence, and what it changes for the user. Keep links, branch names, agent
rosters, and open options out of it.

Recurring failures and their required correction: [pitfalls.md](references/pitfalls.md).

## Boundary

`orchestrate` composes roles and runs their lifecycle. This skill sets what you
refuse to touch, what reaches the user, and what the report may contain.
