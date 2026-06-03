# vito-agent-plugins

Vito's global skill collection, packaged as a Claude Code plugin. The repo root
is the plugin root — all 12 skills under `skills/` are auto-discovered.

## Install

This repo doubles as its own marketplace. From any machine with the repo checked
out at `~/.agents`:

```
/plugin marketplace add ~/.agents
/plugin install vito-agent-plugins@vito-agents
```

Then restart the session. Skills become available as `vito-agent-plugins:<skill>`
(e.g. `/vito-agent-plugins:advanced-plan`).

## Skills

| Skill | What it does |
|---|---|
| advanced-plan | Track a non-trivial dev task as a mini-project that survives context resets and handoff. |
| agent-browser | Browser/Electron automation CLI for AI agents. |
| ask-codex | Consult OpenAI Codex CLI for a second opinion on hard problems. |
| audit-context | Audit, prune, and lean-refactor session context (CLAUDE.md, memory, imports). |
| cc-reflection | Research-grounded reflection report on collaboration over a date range. |
| exa-code | Search the web for code examples, docs, and programming solutions via Exa. |
| find-docs | Retrieve up-to-date library/framework/API documentation (Context7). |
| handoff | Save / pick up task state for cross-session, cross-agent transfer. |
| harness-loop | Autonomous develop → observe → verify → iterate methodology. |
| html-doc | Produce a single self-contained, infographic-style HTML explainer. |
| self-learn | Extract knowledge from the session into Chinese learning notes. |
| tech-selection | Track an open research/feasibility question as a resumable study. |

## Layout

```
.claude-plugin/
  plugin.json        # plugin manifest (name: vito-agent-plugins)
  marketplace.json   # marketplace (name: vito-agents), plugin source "./"
skills/              # 12 skills, auto-discovered
```

## Note on portability

Several skills (`cc-reflection`, `advanced-plan`, `tech-selection`, `exa-code`)
reference their own scripts/assets via hardcoded `~/.claude/skills/<name>/...` (or
repo-relative `skills/<name>/...`) paths. When loaded as a plugin, skills live in
the plugin cache, not `~/.claude/skills`, so those hardcoded paths do **not**
resolve — those skills need `${CLAUDE_PLUGIN_ROOT}`-relative paths to be fully
portable. The packaging here does not modify skill internals; fix those paths if
you hit a missing-file error when a skill tries to read its own assets.
