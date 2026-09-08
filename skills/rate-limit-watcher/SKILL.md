---
name: rate-limit-watcher
description: >-
  Watch running Herdr agents for a subscription rate-limit wall and either wake them after reset or hand the task to another agent.
  Use when agents work unattended overnight, or the user says 守林员/rate limit watcher/限额了帮我盯着.
argument-hint: "[agent names, comma separated | empty = all claude/codex agents]"
metadata:
  kind: sop
---

# rate-limit-watcher

The ranger watches other agents' screens. Two walls, two moves:

- **5-hour wall** → wait until the reset time plus a grace period, then send `继续` and press Enter.
- **Weekly wall**, or any reset more than a day away → stop waiting; another agent takes the task over.

## Run the watch

```bash
RATE_LIMIT_WATCHER_DIR="<absolute path of the directory containing this SKILL.md>";
LOG="${TMPDIR:-/tmp}/rate-limit-watcher.log";
bun "$RATE_LIMIT_WATCHER_DIR/scripts/watch.ts" --agents a,b >> "$LOG"
```

Always `run_in_background`. Without `--agents` it watches every named
claude/codex agent in Herdr. `--once` scans once and exits. `--hours`
(default 24) ends the shift with `shift_over`.

Polling costs no tokens: the script reads screens and types `继续` itself,
every 10 minutes (`--interval` seconds). A finished agent shows no wall and
is skipped. Each new wall carries a new reset time and is a new wait, so one
agent can be woken as often as the night needs.

Events, one JSON line each: `scan` every tick (`watching`, `waiting` with
`nudge_at`), `short_limit`, `nudged`, `weekly_limit` (all walled `agents[]`
with `cwd` and `session`, then exit 2), `shift_over`.

## Report to the user

The user cannot see the log, so the ranger speaks three times:

1. **On start**: run `--once`, report who is watched and who is waiting, then
   start the background watch.
2. **Every 30 minutes**: `/loop 30m` (or ScheduleWakeup) reads the last
   `scan` line and reports the same two lists.
3. **When the watch exits**: report the last event before acting on it.

## On weekly_limit

1. For each agent in `agents[]`, load `take-over`: save a handoff file for
   its session; tell the agent to write its own first if it can still type.
2. Load `use-agents`: the walled CLI is out for the week, so pick a route on
   the other CLI whose quota record is clear. One new agent per handoff, same
   cwd, prompt `读 <handoff file>，按 Next Steps 继续`.
3. Restart the watch so the new agents are covered.

## Gates

- After a nudge the script ignores the same wall line; a new line re-arms it.
- Never guess a reset time; the script defaults to 30 minutes only when the
  message carries none.
- Do not close a blocked agent's tab. The user decides.
