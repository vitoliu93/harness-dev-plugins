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
bun "$RATE_LIMIT_WATCHER_DIR/scripts/watch.ts" --agents a,b
```

Always `run_in_background`. Without `--agents` it watches every named
claude/codex agent in Herdr. `--once` does one scan and exits.

Polling costs no tokens: the script reads screens itself and types `继续`
itself. The caller is woken only by the exit on `weekly_limit`. Default scan
is every 10 minutes (`--interval` seconds); a wall does not go away, so a late
sighting loses nothing. The shift ends after `--hours` (default 24) with a
`shift_over` event and exit 0.

A finished agent shows no wall, so it is skipped without any check on the
task. Each new wall carries a new reset time and counts as a new wait, so one
agent can be woken as many times as the night needs.

The script prints one JSON line per event: `short_limit` (with `nudge_at`),
`nudged`, `weekly_limit`. Agents on one subscription hit walls together, so
`weekly_limit` lists every walled agent (`agents[]` with `cwd` and `session`)
and then exits with code 2; that exit is the wake-up signal for the caller.

## On weekly_limit

1. For each agent in `agents[]`, load `take-over`: save a handoff file for
   its session, and tell the agent to write its own handoff first if it can
   still type.
2. Load `use-agents`: the walled CLI is out for the week, so pick a route on
   the other CLI or provider whose quota record is clear. Start one new agent
   per handoff, in the same cwd, with `读 <handoff file>，按 Next Steps 继续`.
3. Restart the watch so the new agent is covered.

## Gates

- After a nudge, read the pane: if the wall text is still there, the reset
  time was wrong; the script re-arms on the next scan, do not spam `继续`.
- Never guess a reset time; the script defaults to 30 minutes only when the
  message carries none.
- Do not close the blocked agent's tab. The user decides.
