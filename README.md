# dev-kit

Vito's **atom library** for Claude Code, packaged as a plugin. The repo root is
the plugin root — skills under `skills/`, 4 subagents under `agents/`, hooks
under `hooks/` are auto-discovered. Retired skills and their companion subagents
are parked under `archive/` (out of auto-discovery, kept for reference).
North star + roadmap: `docs/north-star.md`.

**Design principle (v2.0)**: every entry here is a project-agnostic atom whose
audience is the *agent* — it binds to no project infra. Workflow orchestration
(the `ship` SOP) lives in the project plugin that owns the infra it binds to
(currently `kox-agent-plugins`); it composes these atoms cross-plugin. Content
written *for the user* (plans' goal.md, reports, HTML explainers) follows the
audience rule: plain language, goal-aligned, no code archaeology — verification
detail stays in the agent-facing layer.

## Install

This repo doubles as its own marketplace. From any machine with the repo checked
out (e.g. at `~/codebase/projects/agent-plugins`):

```
/plugin marketplace add ~/codebase/projects/agent-plugins
/plugin install dev-kit@vito-agents
```

Then restart the session. Skills become available as `dev-kit:<skill>`
(e.g. `/dev-kit:advanced-plan`).

## Skills

| Skill | What it does |
|---|---|
| advanced-plan | Write the deterministic, acceptance-bearing plan for a non-trivial task and track it as a mini-project (goal/spec/todo + worktree isolation). Plan data stays under `docs/advanced-plans/` (fixed convention, shared with debrief and project finalize skills). |
| debrief | 收盘 sedimentation: archive plan artifacts → distill one lifecycle-tagged memory → promote recurring patterns to skill candidates. |
| dispatch-vendors | Dispatch a whole self-contained task (recon/review/red-team/tests/E2E/docs/research) to a standalone vendor agent CLI (dscode / arkcode / kicode / cursor-agent) — unattended, resumable, on someone else's quota. |
| blindspot | Unknown-unknowns territory briefing before planning: repo + domain lens scans, ranked 5-10 item briefing. |
| handoff | Save / pick up task state in global `~/tmp/` for cross-session, cross-agent transfer. |
| exa-code | Search the web for code examples, docs, and programming solutions via Exa. |
| create-readable-html | Single self-contained, infographic-style HTML explainer — output for readers far from the code. 原 html-doc. |
| agent-reach | Platform reach wrapper — YouTube subtitle/transcript extraction (yt-dlp). |
| media-understanding | Local audio/video → Gemini transcription + digest; agent-reach's no-subtitle fallback. |
| docs-organize | 文档—事实—代码锚点体检 + docs/ placement 约定落地. |
| audit-context | Audit, prune, and lean-refactor session context (CLAUDE.md, memory, imports). |
| skill-atlas | Fleet health check: route-overlap matrix, staleness, per-skill trigger evals, context budget. |
| ccobs | SQLite observability ledger over session transcripts: skill usage, spawn model discipline, token economy, hook health. |

Moved out (v2.0): `ship` — now a five-stage lifecycle skill in
`kox-agent-plugins` (context collection → acceptance-bearing plan →
implementation → E2E acceptance → finalize), where the issue tracker, E2E
tester, and deploy pipeline it binds to actually live. Its companion agents
`ship-tester` / `ship-analyst` retired to `archive/` — verification now rides
on plan acceptance clauses + the project's E2E stage.

## Subagents

Four subagents (spawnable via the Agent/Task tool as `dev-kit:<agent>`).
Each runs noisy work in an isolated context so search dumps, engine transcripts,
and upload logs never enter the main session; only a distilled answer comes back.

| Agent | Model | Role |
|---|---|---|
| general-skills-executor | sonnet (default) | Generic runner for noisy delegated skills — loads the skill the prompt names (`exa-code`, `create-readable-html`, `lark-*`), runs it end-to-end, returns only the distilled result. Spawn with `model: opus` for complex tasks; the guard recommends a per-skill baseline (`lark-*` → haiku). |
| second-opinion | opus | Mid-task strategic guidance + clean-context second opinion (当局者迷,旁观者清). Mode opus: advises itself; mode ultra: mediates Claude headless on fable. |
| code-search | sonnet | Token-efficient codebase explorer — prefers auggie-mcp semantic search, `rg`/`fd` for exact matches; returns terse located results, not raw file dumps. |
| investigator | sonnet (opus for hard incidents) | Debug-scenario agent — one spawn per incident; correlates clues across the project's evidence sources (logs / DB / code / tickets / docs, loaded lazily via the project's own skills) inside its own context, returns root cause + evidence chain + reproduction commands. Complements built-in Explore/Plan; replaces per-source fan-out whose clues would otherwise be joined in the expensive main context. |

The other skills are deliberately *not* delegated: they either need the live
session conversation (handoff), are interactive end-to-end (audit-context), or
are methodologies the main agent itself must drive (advanced-plan).

Note: nested subagent spawning requires Claude Code ≥ 2.1.172. On older
versions the executor reads content inline with strict distillation discipline
instead of fanning out per-item readers; investigator likewise degrades to
inline reading when nesting is unavailable.

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
  subagent** (the hook input carries `agent_id` there); in the main context it
  denies inline use of the noisy delegated skills (and reading their source
  files) and redirects each to its subagent. A single `DELEGATE` table is the
  source of truth — `skill_glob | target_agent | model | hint` per row:

  | skill | target | model |
  |---|---|---|
  | `exa-code` | general-skills-executor | sonnet |
  | `create-readable-html` | general-skills-executor | sonnet |
  | `lark-*` | general-skills-executor | haiku |
  | `agent-reach` | general-skills-executor | sonnet |
  | `media-understanding` | general-skills-executor | sonnet |

  `lark-skill-maker` and `lark-im` are exempt (skill development and outbound
  writes stay in the main context). The Read-guard's `*/skills/<name>/*` glob
  protects those skills' source files wherever they live.

Editing a skill's *source* inside the current working tree (developing this repo)
is exempt from the guard. Typing a `/<skill>` slash command directly also
bypasses it, since that path doesn't go through the Skill tool. Hook changes
load at session start — restart the session after editing.

## Layout

```
.claude-plugin/
  plugin.json        # plugin manifest (name: dev-kit)
  marketplace.json   # marketplace (name: vito-agents), plugin source "./"
skills/              # 20 skills, auto-discovered
agents/              # 4 subagents, auto-discovered
hooks/
  hooks.json         # hook registration
  scripts/           # skill-guard.sh, worktree-guard.sh, learn-capture.py, session-replay.py
archive/             # retired skills/ + agents/ (incl. ship, ship-tester, ship-analyst, cto-audit), not auto-discovered
```

## Note on portability

`advanced-plan` resolves its templates via `${CLAUDE_PLUGIN_ROOT}` with a
`~/.claude/skills` fallback. `exa-code` still references its scripts via
hardcoded paths — fix those if you hit a missing-file error when it tries to
read its own assets under a plugin-cache install.
