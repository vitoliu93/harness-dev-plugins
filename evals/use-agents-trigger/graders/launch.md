---
type: llm
weight: 1
---

Pass only if every item holds:
- It reads the local routes file (agents.json) and picks a route for codex, checking its quota record.
- It creates a new Herdr tab with `herdr tab create` using `--no-focus` and the caller's workspace (`--workspace`), then reads tab_id and pane_id from the returned JSON rather than guessing.
- It starts the agent with `herdr agent start <name> --kind … --pane <pane-id>`, and native args after `--` are flags only (no binary name repeated).
- It sends the prompt with `herdr agent prompt` followed by `herdr agent send-keys <name> Enter` (or explains prompt alone does not submit).
- It agrees on a result file the agent writes and says to read that file, not the screen.
- It waits via `herdr agent wait` / `prompt --wait` with `--timeout`, or a background sentinel; not a foreground sleep loop.
