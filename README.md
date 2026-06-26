# vito-agent-plugins

Vito's global skill collection, packaged as a Claude Code plugin. The repo root
is the plugin root — all 6 skills under `skills/`, 4 subagents under
`agents/`, and the hooks under `hooks/` are auto-discovered. Retired skills and
their companion subagents are parked under `archive/` (out of auto-discovery,
kept for reference).

## Install

This repo doubles as its own marketplace. From any machine with the repo checked
out (e.g. at `~/codebase/projects/agent-plugins`):

```
/plugin marketplace add ~/codebase/projects/agent-plugins
/plugin install vito-agent-plugins@vito-agents
```

Then restart the session. Skills become available as `vito-agent-plugins:<skill>`
(e.g. `/vito-agent-plugins:advanced-plan`).

## Skills

| Skill | What it does |
|---|---|
| advanced-plan | Track a non-trivial dev task as a mini-project that survives context resets and handoff. |
| ask-ai | Clean-context second opinion (当局者迷,旁观者清) via opus subagent / Codex gpt-5.5 / ultra (gpt-5.5 @ xhigh or opus-4.8 @ max). |
| audit-context | Audit, prune, and lean-refactor session context (CLAUDE.md, memory, imports). |
| exa-code | Search the web for code examples, docs, and programming solutions via Exa. |
| handoff | Save / pick up task state for cross-session, cross-agent transfer. |
| html-doc | Produce a single self-contained, infographic-style HTML explainer. |

## Subagents

Three skills also ship a companion subagent (spawnable via the Agent/Task tool as
`vito-agent-plugins:<agent>`). Each wraps its skill in an isolated context so the
noisy intermediate work — search dumps, engine transcripts, upload logs — never
enters the main session; only a distilled answer comes back. The other three
skills are deliberately *not* wrapped: they either need the live session
conversation (handoff), are interactive end-to-end (audit-context), or are
methodologies the main agent itself must drive (advanced-plan).

| Agent | Wraps skill | Returns |
|---|---|---|
| ai-second-opinion | ask-ai | Distilled verdict from the chosen engine (opus/codex/ultra) + verification note. |
| exa-searcher | exa-code | Synthesized answer + sources from Exa web/code search. |
| html-visualizer | html-doc | Path of the written HTML artifact + pattern rationale. |

A fourth subagent, **lark-operator** (pinned to sonnet), wraps the *global*
`lark-*` skill family (installed via `npx skills`, not part of this repo). It
executes 飞书 operations — notify, archive, schedule, read-back — and returns
only a confirmation (链接/ID) or a digest, keeping skill bodies and lark-cli
JSON out of the main session.

Note: Claude Code subagents cannot spawn nested subagents, so the wrappers read
content inline with strict distillation discipline instead of fanning out the
per-item readers their skills describe for main-session use.

## Hooks

`hooks/hooks.json` registers two PreToolUse command hooks matching `Skill|Read`,
both exempt inside **any subagent** (the hook input carries `agent_id` there) so
delegation itself is never blocked:

- **`skill-guard.sh`** — in the main context, denies inline use of the three
  wrapped skills (`ask-ai`, `exa-code`, `html-doc`) and reading their source
  files, redirecting to the matching subagent so the noisy skill body stays out
  of the main session.
- **`lark-guard.sh`** — denies loading any `lark-*` skill (and reading
  `*/skills/lark-*` files), redirecting to `vito-agent-plugins:lark-operator` —
  most Lark work is task-irrelevant post-hoc 通知/留档. Exemption:
  `lark-skill-maker` (skill development is a main-context task).

Editing a skill's *source* inside the current working tree (developing this repo)
is exempt from both guards. Typing a `/<skill>` slash command directly also
bypasses them, since that path doesn't go through the Skill tool. Hook changes
load at session start — restart the session after editing.

## Layout

```
.claude-plugin/
  plugin.json        # plugin manifest (name: vito-agent-plugins)
  marketplace.json   # marketplace (name: vito-agents), plugin source "./"
skills/              # 6 skills, auto-discovered
agents/              # 4 companion subagents, auto-discovered
hooks/
  hooks.json         # PreToolUse: skill-guard + lark-guard
  scripts/skill-guard.sh
  scripts/lark-guard.sh
archive/             # retired skills/ + agents/, not auto-discovered
```

## Note on portability

Several skills (`advanced-plan`, `exa-code`)
reference their own scripts/assets via hardcoded `~/.claude/skills/<name>/...` (or
repo-relative `skills/<name>/...`) paths. When loaded as a plugin, skills live in
the plugin cache, not `~/.claude/skills`, so those hardcoded paths do **not**
resolve — those skills need `${CLAUDE_PLUGIN_ROOT}`-relative paths to be fully
portable. The packaging here does not modify skill internals; fix those paths if
you hit a missing-file error when a skill tries to read its own assets.
