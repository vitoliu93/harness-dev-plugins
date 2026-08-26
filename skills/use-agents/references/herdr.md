# Start an agent in Herdr

## Preflight

```bash
test "${HERDR_ENV:-}" = 1
herdr agent
```

Stop when the environment check fails. Use the carrier's headless command
instead.

## One agent, one tab

```bash
herdr tab create --cwd "$PWD" --label '<label>' --no-focus
```

Read `.result.tab.tab_id` and `.result.root_pane.pane_id` from the JSON. Do not
guess IDs.

Start the selected kind in the returned pane:

```bash
herdr agent start <name> --kind <kind> --pane <pane-id> -- <native-agent-args>
herdr agent prompt <name> '<prompt>'
```

Return `{agent_name, tab_id, pane_id, route_id}` to the caller.

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
