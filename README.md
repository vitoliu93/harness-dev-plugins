# dev-kit

Vito's **atom library** for Claude Code and Codex, packaged as one plugin. The
repo root is the plugin root — 20 shared skills live under `skills/`; both hosts
can discover hooks under `hooks/`. Retired skills and subagents live under `archive/`.
North star: `docs/north-star.md`.

**Design principle (v2.0)**: project-agnostic atoms for the *agent* (`metadata.kind`:
`meta` / `atom` / `sop`). Workflow SOPs that bind project infra (e.g. `ship`) live
in the owning project plugin (`kox-agent-plugins`).

## Install

### Claude Code

From any machine with the repo checked out at `<checkout-path>`:

```
/plugin marketplace add <checkout-path>
/plugin install dev-kit@vito-agents
```

Restart the session. Skills load as `dev-kit:<skill>` (for example,
`/dev-kit:advanced-plan`).

### Codex

```bash
codex plugin marketplace add <checkout-path>
codex plugin add dev-kit@vito-agents
```

Restart the session. Skills load as `dev-kit:<skill>` (for example,
`$dev-kit:advanced-plan`).

## Skills

| Skill | What it does |
|---|---|
| advanced-plan | Write and track an acceptance-bearing dev plan as a mini-project. |
| debrief | Archive plan artifacts, distill one memory, surface skill candidates. |
| use-agents | Start an independent agent and find its local route or definition. |
| grill-me | Escalate only high-risk decisions before substantive work. |
| take-over | Continue an interrupted agent task via ccobs; optional handoff to shared tmp. |
| exa-code | Search the web for code examples and API docs via Exa. |
| use-html | Self-contained HTML explainer or pre-build clickable prototype. |
| media-understanding | Transcribe and understand local audio/video. |
| context-audit | Audit always-loaded context or project docs; adopt placement rules. |
| no-ai-slop | Human-voice editing, AI-slop detection, CEO-style task reports. |
| skill-atlas | Fleet health: deterministic and semantic style, overlap, staleness, trigger evals, budget, usage. |
| skill-style-review | Review skill prose for narrative, marketing language, prose walls, and gate loss. |
| ccobs | Build or query the agent observability ledger obs.db. |
| recall | Retrieve up to five past-session clues from ccobs. |
| orchestrate | Compose agent roles and coordinate their work through completion. |
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

No subagents ship since v2.49.0. The former three (`general-skills-executor`,
`code-search`, `investigator`) are kept under `archive/agents/` and can be
restored by moving a file back to `agents/`. Delegation now goes through the
`use-agents` skill (external CLI agents or the host's built-in agents).

## Hooks

`hooks/hooks.json` registers:
- PreToolUse: `skill-guard.sh`, `worktree-guard.sh`, `skill-atlas-guard.sh`, `skill-path-fallback.sh`
- Session/Stop/PostToolUse/PostCompact: `learn-capture.ts`, `session-replay.ts`, `plan-anchor.ts`, `standby-watchdog.ts`, `security-warning-relay.ts`, `compact-audit.ts`, and ccobs `obs-enqueue.ts`

Restart after hook edits.

## Layout

```
.claude-plugin/   # plugin.json + marketplace.json
.codex-plugin/    # Codex plugin.json
skills/           # 20 active skills
hooks/            # shared hook registration + scripts
archive/          # retired skills + subagents (not auto-discovered)
```

## Portability

Bundled files use a named `*_SKILL_DIR` set to the absolute directory containing
the loaded `SKILL.md`; keep the assignment and use in the same shell command.
This works with both Claude Code's `Base directory for this skill` and the skill
path exposed by Codex. Codex-only invocation settings live in
`skills/*/agents/openai.yaml`; Claude Code safely ignores those files. Tool
ledgers default under `$HOME/.claude/observability/` — override with `CCOBS_DIR`,
`SKILL_ATLAS_DIR`.
Handoff files use `HANDOFF_DIR` (default `${TMPDIR:-/tmp}`). External docs use
`EXTERNAL_DOCS_DIR`.
