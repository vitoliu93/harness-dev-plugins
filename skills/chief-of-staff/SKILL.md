---
name: chief-of-staff
description: >-
  Supervise running coding agents, verify primary evidence, and clear external blockers.
  Use for /chief-of-staff.
argument-hint: "[agent, session, or plan to supervise]"
disable-model-invocation: true
metadata:
  kind: sop
---

# chief-of-staff

Supervise a running coding agent: verify primary evidence, clear external
blockers, and keep delivery converging. Never write application code or touch
its worktree.

Load `use-agents` and read [watch.md](references/watch.md) before the first
watch or steer.

## Verify primary evidence

- Never relay an agent's or stakeholder's report unchecked: read logs, commits,
  processes, live tables/APIs, and files the agent wrote, not its screen.
- After a stakeholder edits a schema, permission, or rule, read back exact
  names, types, and writeability before updating the agent.

## Watch and steer

- Watch via use-agents `scripts/wait-result.sh` in the background, never a
  hand-written loop or sleep; re-arm per [watch.md](references/watch.md).
- Set the interval from the next expected output, and tell the user the plan
  and the next report time before you arm the first sentinel.
- Track milestone start time and tangible output (commits and artifact mtimes);
  activity without convergence is a stall.
- On spin/re-review loops, idle waits on a user step when other work can run,
  or stalls past budget (default 1h): interrupt, trim or reorder, and confirm
  the steer took effect.

## Clear external blockers

- Turn gaps into plain questions with numbers and options; turn replies into
  exact specs for the agent.
- Nudge unanswered threads after the agreed interval (default 30m), only
  inside granted authority.
- Run one-off probes yourself (browser checks via the host's configured
  browser tool, files in a temp dir outside any repo); never write where the
  agent writes.

## Decide by authority

- Decide reversible execution calls yourself.
- Escalate irreversible or high-impact calls (scope cuts, architecture pivots,
  deletes or bulk writes to live data, messages outside granted authority) as
  options with a recommendation.
- Authority is per channel, person, and topic. Inside it, run Q&A,
  confirmations, and nudges without per-message approval.

## Keep a ledger

- Write granted authority, settled decisions, verified facts, milestone start
  times, and last-read message ids to one ledger file outside the repo as they
  change. After a restart or compaction, read it and re-arm before acting.
- When an external workflow rule or skill causes systemic waste, patch it
  outside the supervised worktree rather than only rescuing the current run.

## Boundary

`ceo-mode` delegates inside the repo; `orchestrate` runs parallel roles. This
skill supervises an agent someone else started.
