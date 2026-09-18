# Start an agent in Herdr

## Preflight

```bash
command -v herdr >/dev/null || { echo 'Herdr is unavailable' >&2; exit 1; }
herdr status server | grep '^status: running$' >/dev/null || {
  echo 'Herdr is not running or unreachable' >&2; exit 1;
}
```

`HERDR_ENV=1` means the caller is already inside Herdr; it is not required.
Outside Herdr, connect to the running local Herdr. Stop with the command error
when Herdr is missing or unreachable; do not switch transports.

## One agent, one tab

```bash
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label '<label>' --no-focus
```

The agent must live in the caller's workspace. `HERDR_WORKSPACE_ID` (also injected
at session start as `<herdr-context>`) names it; never create or pick another
workspace. Only when the caller is outside Herdr (variable unset) drop
`--workspace` and let Herdr use its default.

Read `.result.tab.tab_id` and `.result.root_pane.pane_id` from the JSON. Do not
guess IDs. Operate only this returned tab and pane; do not inspect, focus, or
change existing tabs.

Start the selected kind in the returned pane:

```bash
herdr agent start <name> --kind <kind> --pane <pane-id> -- <native-agent-args>
herdr agent prompt <name> '<prompt>'
herdr agent send-keys <name> Enter
```

`<native-agent-args>` are flags only (`--model x --trust`). Herdr prepends the
binary itself; writing `-- cursor-agent --model x` makes the extra word the
agent's first prompt and it answers that instead of your task.

`agent prompt` types into the input box but does not submit; the `send-keys
Enter` line is required. `agent start` may report a startup timeout while the
process is already up: read the pane, and if the agent is there, send the
prompt with `herdr pane send-text <pane-id> '<prompt>'` + `herdr pane send-keys
<pane-id> Enter`.

Return `{agent_name, tab_id, pane_id, route_id}` to the caller.

Launch is three steps; skip one and the agent is not launched. Do not retype them:
`scripts/launch-agent.sh <name> <kind> <label> <prompt-file> [-- <native-args>]`
next to this skill runs all three with the checks below and prints the JSON.

The steps it performs:

1. `agent start`, then `pane read` — trust the screen, not the start exit code.
   Running `agent start` in the same second as `tab create` can silently
   register nothing. Wait ~3s after `tab create`, confirm with
   `herdr agent get <name>` before prompting; if missing, run `agent start`
   again on the same pane.
2. `agent prompt` + `send-keys Enter`, then `pane read` again: it must be
   reading the task card, not sitting at `→ <your prompt>`.
3. Only now attach the sentinel and tell the user it is running.

Claude kind: start with `--permission-mode auto` so it never stops at a
`Do you want to proceed?` box.

Sentinel: use
`scripts/wait-result.sh <agent> <result-file> <marker> [timeout] [progress-file] [stall-seconds]`
next to this skill (exit 0 ready · 2 stuck · 3 idle · 4 timeout · 5 stalled)
instead of rewriting the loop. The run completes (exit 0) only when the result
file's last non-empty line equals `<marker>` alone, ignoring leading or trailing
whitespace and CRLF. When given a progress file, the sentinel waits for the
stall-seconds startup grace period (default 600s) before checking; it exits 5 if
the progress file is missing or its mtime does not advance past stall-seconds.
On exit 5, stderr prints the reason and the last line of the progress file.
Always `run_in_background`; a foreground poll blocks the user's next message.
It must recognise three stuck states besides "no result file": prompt left
unsubmitted in the input box, a permission box, and `agent_status: blocked`.
`idle` alone is not stopped: an agent that pushed work into a background shell
ends its turn while the screen tail still shows `N shells`; keep waiting. Text
sent through `pane send-text` is shell-parsed again — quote lines containing `=`.

## Inspect and take over

```bash
herdr agent get <name>
herdr agent read <name> --source recent-unwrapped --lines 120
herdr agent focus <name>
```

Waiting on a result, never trust `agent_status` alone: an interrupted agent still
reports done/idle. A sentinel must also run `herdr agent read <name> --lines 5` and
check the screen tail for both `Interrupted · What should Claude do instead?` and a
bare `❯` prompt, then re-prompt the agent.

Use `--no-focus` for background starts. Leave the tab open. Only the caller
that owns the full run decides when every created tab can close.
