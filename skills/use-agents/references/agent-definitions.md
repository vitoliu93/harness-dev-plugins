# Agent definition locations

Check the most specific location first.

| Host | Project or plugin | Personal |
|---|---|---|
| Claude Code | `<plugin-root>/agents/*.md` | `$HOME/.claude/agents/*.md` |
| Codex | project-provided runtime roles | `$HOME/.codex/agents/*.toml` |
| Cursor | project rules discovered by Cursor | `$HOME/.cursor/agents/*.md` |

The plugin root `agents/` directory is Claude Code-only. Shared instructions
belong in `skills/`.

For CLI agents without a named role file, the selected CLI process plus model
route is the agent definition. Read it from `agents.json`.

Inside Herdr, run `herdr agent` to list installed agent kinds. A kind describes
how Herdr starts and detects a CLI; it does not define the agent's work role.
