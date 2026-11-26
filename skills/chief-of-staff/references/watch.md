# Watch and steer a running agent

The user names the supervised agent; operate that agent's tab only (this
overrides `use-agents`'s default rule against touching existing tabs).

## Watch

```bash
USE_AGENTS_SKILL_DIR="<absolute path of the directory containing the loaded use-agents/SKILL.md>";
bash "$USE_AGENTS_SKILL_DIR/scripts/wait-result.sh" <agent> "${CCOBS_DIR:-$HOME/.claude/observability}/chief-of-staff/never.md" NEVER <channel-interval-sec>
```

- Run it as a background task that wakes the host on exit (`run_in_background`
  in Claude Code). If the host has no waking background task, tell the user and
  check by hand at each turn; do not sleep.
- The result path is never written. Exit 2 = stuck or interrupted, 3 = idle,
  4 = interval elapsed: check stakeholder channels, then re-arm.
- After exit 3 the agent is waiting on someone. Re-arm with
  `herdr agent wait <agent> --until working --until blocked --timeout <channel-interval-ms>`
  instead; `wait-result.sh` would exit 3 again within three polls (~120s).
- One sentinel per agent. Stop the old one through the client's task-stop
  before re-arming; the exit notice of a sentinel you stopped is not a signal.
- Channel read: only messages after the ledger's last-read id, and skip your
  own sender id.
- Screen text is not evidence of output; verify commits and files.

## Steer

1. `herdr agent get <agent>` + `herdr agent read <agent> --lines 20`: check
   whether a long foreground command is running (it will not read queued
   prompts while running).
2. Stop the sentinel first (it reports an interrupt as stuck). Interrupt only a
   working agent: `herdr agent send-keys <agent> esc`, then read until the
   screen shows the interrupt or an idle prompt.
3. Send the steer via `herdr agent prompt <agent> '<steer>'` (when asking it to
   converge, include "do not split or spawn subagents" so user-facing hooks do
   not fan it out). Then `herdr agent read <agent> --lines 12`: confirm the
   agent is acting on it; only send `herdr agent send-keys <agent> Enter` if
   the text is still sitting unsubmitted in the input box (`❯ <steer>`).
4. Re-arm the sentinel.
