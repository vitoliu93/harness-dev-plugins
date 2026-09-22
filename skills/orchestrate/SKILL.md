---
name: orchestrate
description: >-
  Pick the scene team from the user's teams directory, compose its roles, and coordinate their work through completion.
  Use when one task needs several roles or a runtime behavior change needs independent review.
argument-hint: "[task to split into roles]"
metadata:
  kind: sop
---

# orchestrate

The host owns the goal, task graph, acceptance, and final decision. Agents own
bounded role work.

## Pick the team

List `${CCOBS_DIR:-$HOME/.claude/observability}/teams/*.md` and read only the
file whose frontmatter `use:` matches the task. If none exist, copy
[delivery-team.md](references/delivery-team.md) to `teams/delivery.md` and
report its path. If none fit, create one from the task with roles and default
agents; let the user correct it in one line.

Choose the fewest roles. The host sets instance count from task size and time.
Parallel programmers need independent slices (separate dirs, no shared files),
one [role card](references/role-card.md), and one write boundary each. Do not
launch until outputs, writes, dependencies, and checks are clear.

## Launch through use-agents

请严格按照 team 推荐的模型顺序选择 agents，每个 agent 均已配备对应的工具和 mcp。

Load `use-agents` for local routes and carrier commands. In Herdr, create one
tab per role instance and keep `{role, agent_name, tab_id, route_id}`. Use
`--no-focus` so the user's tab stays in place.

Follow the team's route order. Read quota first; use `fallback` only when all
`normal` routes are unavailable.

## Coordinate

- Start independent roles in parallel; serialize declared dependencies.
- Agents do not coordinate with each other. The host passes outputs between them.
- Whoever made a change does not check it. The checking role reruns the checks
  itself and does not accept the maker's report as evidence, and builds its own
  fixture: a maker's rig can disable the very thing it claims to prove — an env
  override that also starves a dependency, a probe that samples only the hit.
- Runtime-changing delivery always gets a reviewer for correctness, project fit
  and simplification, and algorithm and performance. Blocking findings cite
  exact code and evidence; no PASS, no delivery.
- Freeze reviewed targets during review: the reviewed directory accepts no
  changes once review starts; to change it, stop review or await its report,
  record the new commit or diff summary, and re-review. Review cards state the
  baseline (commit or `git diff` sha256).
- The host runs each completion check and the final integrated check.
- Quota failure: keep the tab and partial output, then choose another available route.

Full lifecycle: [lifecycle.md](references/lifecycle.md).

## Close

After every role and the integrated check pass, close only this run's tabs. On
cancellation or unresolved block, leave them open and report their IDs.
