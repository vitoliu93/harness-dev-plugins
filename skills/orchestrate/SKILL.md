---
name: orchestrate
description: >-
  Compose independent agent roles and coordinate their work through completion.
  Use when one task needs several roles such as advisor, researcher, programmer, tester, or audit.
argument-hint: "[task to split into roles]"
metadata:
  kind: sop
---

# orchestrate

The host owns the goal, task graph, acceptance, and final decision. Agents own
bounded role work.

## Build the team

Choose the fewest roles needed. Definitions: [roles.md](references/roles.md).
Write one [role card](references/role-card.md) per role instance. Do not launch
until outputs, write boundaries, dependencies, and completion checks are clear.

## Launch through use-agents

Load `use-agents` for local routes and carrier commands. In Herdr, create one
tab per role instance and keep `{role, agent_name, tab_id, route_id}`. Use
`--no-focus` so the user's tab stays in place.

Later `normal` routes are normal choices. Use `fallback` only when normal
routes are unavailable. Read the route-specific quota file before launch.

## Coordinate

- Start independent roles in parallel; serialize declared dependencies.
- Agents do not coordinate with each other. The host passes outputs between them.
- A programmer produces the change; a tester runs tests from the requirement
  and diff alone; audit is the final read-only acceptance and reruns the checks.
- The host runs each completion check and the final integrated check.
- Quota failure: keep the tab and partial output, then choose another available route.

Full lifecycle: [lifecycle.md](references/lifecycle.md).

## Close

After every role and the integrated check pass, close only the tabs recorded for
this run. If the run is cancelled or blocked, leave them open and report their IDs.
