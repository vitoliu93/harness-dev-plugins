# vito-agent-plugins

Vito's global skill collection, packaged as a Claude Code plugin. The repo root
is the plugin root — all 10 skills under `skills/`, 5 subagents under
`agents/`, and the hooks under `hooks/` are auto-discovered. Retired skills and
their companion subagents are parked under `archive/` (out of auto-discovery,
kept for reference). North star + roadmap: `docs/north-star.md`.

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
| ship | Adaptive dev SOP: size (S/M/L) → grill → plan → code → review → 收盘. Chains grill-me, advanced-plan, test subagents, ponytail-review, project extension agents, debrief. |
| debrief | 收盘 sedimentation: archive plan artifacts → distill one lifecycle-tagged memory → promote recurring patterns to skill candidates. |
| dispatch | Outsource brief-able execution to external headless engines (dscode/arkcode/droid/cursor-agent/codex) — smart model plans, cheap engine types, you verify the diff. |
| advanced-plan | Track a non-trivial dev task as a mini-project that survives context resets and handoff. |
| worktree | Conventions on top of git worktrees: branch-as-identity, attach/resume, cross-machine handoff, exit-safety order; documents what Claude Code auto-isolates. |
| ask-ai | Clean-context second opinion (当局者迷,旁观者清) via opus subagent / Codex gpt-5.5 / ultra (gpt-5.5 @ xhigh or opus-4.8 @ max). |
| audit-context | Audit, prune, and lean-refactor session context (CLAUDE.md, memory, imports). |
| exa-code | Search the web for code examples, docs, and programming solutions via Exa. |
| handoff | Save / pick up task state for cross-session, cross-agent transfer. |
| html-doc | Produce a single self-contained, infographic-style HTML explainer. |

## Subagents

Five subagents (spawnable via the Agent/Task tool as `vito-agent-plugins:<agent>`).
Each runs noisy work in an isolated context so search dumps, engine transcripts,
and upload logs never enter the main session; only a distilled answer comes back.

| Agent | Model | Role |
|---|---|---|
| ship-tester | sonnet | Per-todo verification for /ship — reads the item, designs a test, runs it, writes `[PASS]`/`[FAIL + reason]` back to `todo.md`. Never fixes code. |
| ship-analyst | sonnet | Autonomous requirement analyst for /ship — resolves `unexpected.md` items against goal/spec without interrupting the user. |
| general-skills-executor | sonnet (default) | Generic runner for noisy delegated skills — loads the skill the prompt names (`exa-code`, `html-doc`, `lark-*`), runs it end-to-end, returns only the distilled result (answer + sources / file path / 链接·ID). Holds no skill-specific knowledge — the skill body carries the specifics. Spawn with `model: opus` for complex tasks; the guard recommends a per-skill baseline (`lark-*` → haiku). |
| ai-second-opinion | opus | Clean-context second opinion (当局者迷,旁观者清). Not a thin wrapper — it picks engine/mode (opus self-review / Codex gpt-5.5 / ultra) and reasons itself. Backs the `ask-ai` skill. |
| code-search | sonnet | Standalone token-efficient codebase explorer — wraps no skill. Prefers auggie-mcp semantic search, `rg`/`fd` for exact matches, gemini-cli for complex analysis; returns terse located results, not raw file dumps. |

The other repo skills are deliberately *not* delegated: they either need the live
session conversation (handoff), are interactive end-to-end (audit-context), or are
methodologies the main agent itself must drive (advanced-plan).

Note: Claude Code subagents cannot spawn nested subagents, so the executor reads
content inline with strict distillation discipline instead of fanning out the
per-item readers its skills describe for main-session use.

## Hooks

`hooks/hooks.json` registers four command hooks:

- **`learn-capture.py`** (Stop) — greps the session transcript for
  `[LEARN] <type>: <rule>` markers the model emitted while working and appends
  new ones (deduped) to the project's `.claude/LEARNED.md` — the raw learning
  inbox. Pure observer: always exit 0, never blocks stopping.
- **`session-replay.py`** (SessionStart) — injects the [LEARN] convention plus
  the last 5 LEARNED.md entries as context, closing the loop: correct once,
  remembered next session. `/debrief` graduates inbox entries into curated memory.
- **`worktree-guard.sh`** (PreToolUse, `Bash`) — enforces the exit-safety order
  on `git worktree remove`: denies removal from inside the worktree, and
  removal of a dirty worktree without `--force`.
- **`skill-guard.sh`** (PreToolUse, `Skill|Read`) — exempt inside **any
  subagent** (the hook input carries `agent_id` there) so delegation itself is
  never blocked:

- **`skill-guard.sh`** — in the main context, denies inline use of the noisy
  delegated skills (and reading their source files) and redirects each to its
  subagent. A single `DELEGATE` table is the source of truth — `skill_glob |
  target_agent | model | hint` per row, so delegating a new skill is one line:

  | skill | target | model |
  |---|---|---|
  | `exa-code` | general-skills-executor | sonnet |
  | `html-doc` | general-skills-executor | sonnet |
  | `lark-*` | general-skills-executor | haiku |
  | `ask-ai` | ai-second-opinion | (agent picks its own mode) |

  `lark-skill-maker` is exempt (skill development is a main-context task).
  The Read-guard's `*/skills/<name>/*` glob protects those skills' source files
  wherever they live — the global `~/.agents/skills/` store, `$PWD/skills/`, or
  the installed plugin cache.

Editing a skill's *source* inside the current working tree (developing this repo)
is exempt from the guard. Typing a `/<skill>` slash command directly also
bypasses it, since that path doesn't go through the Skill tool. Hook changes
load at session start — restart the session after editing.

## Layout

```
.claude-plugin/
  plugin.json        # plugin manifest (name: vito-agent-plugins)
  marketplace.json   # marketplace (name: vito-agents), plugin source "./"
skills/              # 10 skills, auto-discovered
agents/              # 5 subagents, auto-discovered
hooks/
  hooks.json         # PreToolUse: skill-guard
  scripts/skill-guard.sh
archive/             # retired skills/ + agents/, not auto-discovered
```

## Note on portability

`advanced-plan` now resolves its templates via `${CLAUDE_PLUGIN_ROOT}` with a
`~/.claude/skills` fallback. `exa-code` still references its scripts via
hardcoded paths — fix those if you hit a missing-file error when it tries to
read its own assets under a plugin-cache install.
