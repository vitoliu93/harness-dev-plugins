# dev-kit

Vito's **atom library** for Claude Code and Codex, packaged as one plugin. The
repo root is the plugin root — 14 shared skills live under `skills/`; both hosts
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
| debrief | Archive plan artifacts, distill the session into ccobs, then improve, merge, or retire skills before adding a candidate. |
| use-agents | Start an independent agent and find its local route or definition. |
| grill-me | Round-by-round interview across a design tree until every branch is settled. |
| use-html | One HTML page of diagrams and charts that makes a concept, repo, flow, document, retro, or report quick to grasp. |
| context-audit | Audit always-loaded context or project docs; adopt placement rules. |
| ccobs | Build or query the agent observability ledger obs.db. |
| orchestrate | Compose agent roles and coordinate their work through completion. |
| skill-forge | Create or improve skills, or check the whole fleet, through deterministic and semantic style (`style_review.ts`), budget, routing, and trigger gates. |
| ceo-mode | Hold the CEO seat: keep the goal, hand work to agents, report the outcome. |
| chief-of-staff | Supervise running coding agents, verify primary evidence, and clear external blockers (`/chief-of-staff`). |
| in-your-own-words | Restate in your own words what the user's goals and problem are (`/in-your-own-words`). |
| self-profile | Profile the user from their own session history as one chart-first HTML page. |

### Learning

Boundary: *learning vs shipping* (`docs/study/north-star.md`).

| Skill | What it does |
|---|---|
| teach-me | Probe what you know about one topic, then explain only the gap. |

Moved out (v2.0): `ship` → `kox-agent-plugins`.

## Subagents

No subagents ship since v2.49.0. Former agents are kept under `archive/agents/`
and can be restored by moving a file back to `agents/`（已归档: `general-skills-executor` / `code-search` / `investigator`）.
Delegation now goes through the
`use-agents` skill (external CLI agents or the host's built-in agents).

## Hooks

`hooks/hooks.json` registers:
- PreToolUse: `worktree-guard.sh`, `skill-atlas-guard.sh`, `skill-path-fallback.sh`
- SessionStart: `session-replay.ts`, `plan-anchor.ts`
- UserPromptSubmit: `understand.ts`
- PostToolUse: `security-warning-relay.ts`, `plan-split.ts`
- Stop: `learn-capture.ts`, ccobs `obs-enqueue.ts`
- PostCompact: `compact-audit.ts`

Hooks that inject text are kept only while `bun hooks/scripts/inject-evidence.ts`
shows sessions following them.

Restart after hook edits.

## Optional Mod: `mods/jev`

Claude Code only, and a separate install from dev-kit. On each typed prompt it
asks Jev which installed skills fit the task, then adds the answer as hidden
context.

```
/plugin install dev-kit-jev@vito-agents
```

It only loads where function hooks are enabled, so put this in your settings
once: `{"env": {"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"}}`. Debugging from a
checkout instead: `claude --plugin-dir <checkout-path>/mods/jev`, which
`claude --help` says lasts for that session only.

`TYPESAFE_API_KEY` (or the `apiKey` option) is the only switch: with the plugin
installed and a key exported, every prompt goes to TypeSafe; to stop that,
remove the key or uninstall. Without a key, or on any failure, the
prompt goes through unchanged. Only the current prompt, recent messages (at
most 25,000 characters) and skill names with descriptions are
sent, redacted and size-bounded; tool output and paths are not. Each prompt waits at most `timeoutMs` (default 3000, capped at 8000).
Manual: `mods/jev/README.md`.

## Layout

```
.claude-plugin/   # plugin.json + marketplace.json
.codex-plugin/    # Codex plugin.json
skills/           # 14 active skills
hooks/            # shared hook registration + scripts
mods/jev/         # optional Claude-only Mod (marketplace entry `dev-kit-jev`)
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
