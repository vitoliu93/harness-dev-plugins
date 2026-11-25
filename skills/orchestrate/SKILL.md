---
name: orchestrate
description: >-
  Split work into independent parts, run them on parallel agents, and coordinate to completion.
  Use when the user says 并行/拆分/委派 agents/fan out/swarm, or a task needs several roles or independent review.
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

Load `use-agents` for local routes and carrier commands. In Herdr, create one
tab per role instance and keep `{role, agent_name, tab_id, route_id}`.

Launch each role on the team's default agents in the listed order, not on a
subagent you pick yourself: each listed agent already has its tools and MCP.

## Coordinate

- Start independent roles in parallel; serialize declared dependencies.
- Agents do not coordinate with each other. The host passes outputs between them.
- Whoever made a change does not check it. The checking role reruns the checks
  itself on its own fixture and does not accept the maker's report as evidence.
- Runtime-changing delivery always gets a reviewer. No PASS, no delivery.
- PASS invalidation is tiered (host edits included) and re-review is capped at
  2 rounds per integrated diff; see [review.md](references/review.md).
- Launch and wait with use-agents `scripts/launch-agent.sh` and
  `scripts/wait-result.sh`, never a hand-written marker loop.
- A read-only preflight proves any state a card relies on.
- The host runs each completion check and the final integrated check.
- An action that a permission prompt, hook or classifier blocked goes back to
  the user with the block's own text. Do not retry it through a new agent, and
  write "the user approved" on a card only when the user said so.

Review rules: [review.md](references/review.md).
Full lifecycle: [lifecycle.md](references/lifecycle.md).

## Close

Keep the acceptance environment (running app, its worktree, a tester tab)
until every real-environment check is done or the user drops it.
After every role and the integrated check pass, close only this run's tabs. On
cancellation or unresolved block, leave them open and report their IDs.
