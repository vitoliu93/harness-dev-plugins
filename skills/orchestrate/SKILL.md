---
name: orchestrate
description: >-
  Pick the scene team from the user's teams directory, compose its roles, and coordinate their work through completion.
  Use when one task needs several roles.
argument-hint: "[task to split into roles]"
metadata:
  kind: sop
---

# orchestrate

The host owns the goal, task graph, acceptance, and final decision. Agents own
bounded role work.

## Pick the team

List `${CCOBS_DIR:-$HOME/.claude/observability}/teams/*.md`. Each file's
frontmatter `use:` says which tasks it fits. Pick the one matching the task's
scene and read only that file. If the directory is missing, copy
[delivery-team.md](references/delivery-team.md) to `teams/delivery.md` and tell
the user where it is.

Choose the fewest roles from that team. Write one
[role card](references/role-card.md) per role instance. Do not launch until
outputs, write boundaries, dependencies, and completion checks are clear.

## Launch through use-agents

Load `use-agents` for local routes and carrier commands. In Herdr, create one
tab per role instance and keep `{role, agent_name, tab_id, route_id}`. Use
`--no-focus` so the user's tab stays in place.

Later `normal` routes are normal choices. Use `fallback` only when normal
routes are unavailable. Read the route-specific quota file before launch.

## Coordinate

- Start independent roles in parallel; serialize declared dependencies.
- Agents do not coordinate with each other. The host passes outputs between them.
- Whoever made a change does not check it. The checking role reruns the checks
  itself and does not accept the maker's report as evidence.
- The host runs each completion check and the final integrated check.
- Quota failure: keep the tab and partial output, then choose another available route.

Full lifecycle: [lifecycle.md](references/lifecycle.md).

## Close

After every role and the integrated check pass, close only the tabs recorded for
this run. If the run is cancelled or blocked, leave them open and report their IDs.
