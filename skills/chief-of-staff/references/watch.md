# Watch and steer a running agent

The user names the supervised agent; operate that agent's tab only (this
overrides `use-agents`'s default rule against touching existing tabs).

## Read progress from the session file

Judge progress, stalls, and loops only from the agent's session file, never
from its screen. A screen shows the tool calls inside one long script as a
repeating command, so a waiting agent looks stuck.

- Get the session id: `herdr agent get <agent>` → `agent_session.value`.
- Claude Code: `~/.claude/projects/<cwd with / and . as ->/<session id>.jsonl`.
  Read the assistant text, the tool inputs, and the tool results with
  timestamps after the last checked time.
- Before you call it a stall, write down what changed in that period (results,
  answers, commits, files). Only "nothing changed" is a stall.
- Use `herdr agent read` only for screen state: whether the agent is idle,
  interrupted, or has unsubmitted text in its input box.

## Watch

```bash
USE_AGENTS_SKILL_DIR="<absolute path of the directory containing the loaded use-agents/SKILL.md>";
bash "$USE_AGENTS_SKILL_DIR/scripts/wait-result.sh" <agent> "${CCOBS_DIR:-$HOME/.claude/observability}/chief-of-staff/never.md" NEVER <channel-interval-sec>
```

- Run it as a background task that wakes the host on exit (`run_in_background`
  in Claude Code). If the host has no waking background task, tell the user and
  check by hand at each turn; do not sleep.
- The result path is never written. On exit 2 (stuck or interrupted): inspect
  and steer before re-arming. On exit 4 (interval elapsed): check stakeholder
  channels, then re-arm. On exit 3 (idle, waiting on someone): check channels,
  then re-arm with
  `herdr agent wait <agent> --until working --until blocked --timeout <channel-interval-ms>`
  instead (`wait-result.sh` would exit 3 again within ~120s).
- One sentinel per agent. Stop the old one through the client's task-stop
  before re-arming; the exit notice of a sentinel you stopped is not a signal.
- Channel read: only messages after the ledger's last-read id, and skip your
  own sender id.

## Steer

1. Read the session file (see above) to find out what the agent is doing and
   why. Then `herdr agent read <agent> --lines 20` only to check
   whether a long foreground command is running (queued prompts will not be
   read until it ends — either wait for it or interrupt in step 2).
2. Stop the sentinel first (it reports an interrupt as stuck). Interrupt only a
   working agent: `herdr agent send-keys <agent> esc`, then read until the
   screen shows the interrupt or an idle prompt.
3. Send the steer via `herdr agent prompt <agent> '<steer>'`. When asking it to
   converge, add `"do not split or spawn subagents"` to prevent hook-driven
   fan-out.
4. Verify with `herdr agent read <agent> --lines 12` that the agent is acting
   on the steer; send `herdr agent send-keys <agent> Enter` only if the text is
   still sitting unsubmitted in the input box.
5. Re-arm the sentinel.
