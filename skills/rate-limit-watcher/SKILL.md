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
bun "$RATE_LIMIT_WATCHER_DIR/scripts/watch.ts" --agents a,b --interval 60 --grace 120
```

Always `run_in_background`. Without `--agents` it watches every named
claude/codex agent in Herdr. `--once` does one scan and exits.

The script prints one JSON line per event: `short_limit` (with `nudge_at`),
`nudged`, `weekly_limit`. On `weekly_limit` it exits with code 2; that exit
is the wake-up signal for the caller.

## On weekly_limit

1. Load `take-over`: save a handoff file for the blocked agent's session (the
   event carries `session`), and tell the blocked agent to write its own
   handoff first if it can still type.
2. Load `use-agents`: start a new agent on a route whose quota record is
   clear, in the same cwd, with the prompt `读 <handoff file>，按 Next Steps 继续`.
3. Restart the watch so the new agent is covered.

## Gates

- After a nudge, read the pane: if the wall text is still there, the reset
  time was wrong; the script re-arms on the next scan, do not spam `继续`.
- Never guess a reset time; the script defaults to 30 minutes only when the
  message carries none.
- Do not close the blocked agent's tab. The user decides.
