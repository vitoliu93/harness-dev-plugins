---
type: llm
weight: 1
---

Pass only if every item holds:
- First runs the watch script once with `--once` and reports who is watched and who is waiting, before starting the background watch.
- Starts the watch with `nohup … & disown` (not a harness background task), and keeps the printed absolute log path.
- Distinguishes the 5-hour wall (wait until reset plus grace, then send 继续 + Enter) from the weekly wall / reset over a day away (hand the task to another agent).
- Plans a check every 30 minutes (`/loop 30m` or ScheduleWakeup) that reads the last scan line, runs `pgrep -f watch.ts`, and relaunches if the process is gone.
- On weekly_limit: saves a handoff via take-over, starts a new agent on the other CLI via use-agents with prompt to read the handoff file, then restarts the watch.
- Does not close blocked agents' tabs and does not guess reset times.
