# dev-kit

Vito's **atom library** for Claude Code, packaged as a plugin. The repo root is
the plugin root — 20 skills under `skills/`, 3 subagents under `agents/`, hooks
under `hooks/` are auto-discovered. Retired skills live under `archive/`.
North star: `docs/north-star.md`.

**Design principle (v2.0)**: project-agnostic atoms for the *agent* (`metadata.kind`:
`meta` / `atom` / `sop`). Workflow SOPs that bind project infra (e.g. `ship`) live
in the owning project plugin (`kox-agent-plugins`).

## Install

From any machine with the repo checked out at `<checkout-path>`:

```
/plugin marketplace add <checkout-path>
/plugin install dev-kit@vito-agents
```

Restart the session. Skills load as `dev-kit:<skill>` (e.g. `/dev-kit:advanced-plan`).

## Skills

| Skill | What it does |
|---|---|
| advanced-plan | Write and track an acceptance-bearing dev plan as a mini-project. |
| debrief | Archive plan artifacts, distill one memory, surface skill candidates. |
| dispatch-vendors | Delegate self-contained tasks or advisory judgments to vendor CLIs. |
| grill-me | Escalate only high-risk decisions before substantive work. |
| take-over | Continue an interrupted agent task via ccobs; optional handoff to shared tmp. |
| exa-code | Search the web for code examples and API docs via Exa. |
| use-html | Self-contained HTML explainer or pre-build clickable prototype. |
| media-understanding | Transcribe and understand local audio/video. |
| context-audit | Audit always-loaded context or project docs; adopt placement rules. |
| no-ai-slop | Human-voice editing, AI-slop detection, CEO-style task reports. |
| skill-atlas | Fleet health: deterministic and semantic style, overlap, staleness, trigger evals, budget, usage. |
| llm-call | Call DeepSeek through Bun and the global OpenAI SDK at maximum reasoning effort. |
| skill-style-review | Review skill prose through llm-call for narrative, marketing language, prose walls, and gate loss. |
| ccobs | Build or query the agent observability ledger obs.db. |
| recall | Retrieve up to five past-session clues from ccobs. |
| orchestrate | Route coding delegation with spec, acceptance, and parallel gates. |
| skill-forge | Create or improve skills through deterministic and semantic style, budget, routing, and trigger gates. |
| cto-audit | CTO-lens audit of architecture, domain model, and harness rules. |

### Learning

Boundary: *learning vs shipping* (`docs/study/north-star.md`).

| Skill | What it does |
|---|---|
| resume-learning | Save/restore learning progress to `RESUME.md` with evidence + recall. |
| study-coach | Goal audit, motivation rescue, progress review, practice, prerequisites. |

Moved out (v2.0): `ship` → `kox-agent-plugins`.

## Subagents

| Agent | Model | Role |
|---|---|---|
| general-skills-executor | sonnet (opus if complex) | Noisy delegated skills (`exa-code`, `use-html`, `lark-*`) — distilled result only. |
| code-search | sonnet | Token-efficient codebase explorer. |
| investigator | sonnet (opus for hard incidents) | Debug agent — root cause + evidence chain per incident. |

Skills not delegated: live-session work (take-over), interactive audits (context-audit),
methodologies the host must drive (advanced-plan).

Nested subagent spawning requires Claude Code ≥ 2.1.172.

## Hooks

`hooks/hooks.json` registers:
- PreToolUse: `skill-guard.sh`, `worktree-guard.sh`, `skill-atlas-guard.sh`, `skill-path-fallback.sh`
- Session/Stop/PostToolUse/PostCompact: `learn-capture.py`, `session-replay.py`, `plan-anchor.py`, `standby-watchdog.py`, `security-warning-relay.py`, `compact-audit.py`, and ccobs `obs-enqueue.ts`

Restart after hook edits.

## Layout

```
.claude-plugin/   # plugin.json + marketplace.json
skills/           # 20 active skills
agents/           # 3 subagents
hooks/            # hook registration + scripts
archive/          # retired skills (not auto-discovered)
```

## Portability

`advanced-plan` templates resolve via `${CLAUDE_PLUGIN_ROOT}`. Tool ledgers default
under `$HOME/.claude/observability/` — override with `CCOBS_DIR`, `SKILL_ATLAS_DIR`.
Handoff files use `HANDOFF_DIR` (default `${TMPDIR:-/tmp}`). External docs use
`EXTERNAL_DOCS_DIR`.
