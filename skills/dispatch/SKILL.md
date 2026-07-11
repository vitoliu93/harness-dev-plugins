---
name: dispatch
description: >-
  Outsource brief-able execution work to external headless engines — the
  current fleet lives in references/engines.md (claude-binary wrappers on
  DeepSeek/Ark quota, droid, cursor-agent) — so the scarce Claude quota stays
  on planning and review. Also routes read-only 勘察/影响面分析 to cursor's
  plan mode. Smart model plans, cheap engine executes, machine checks verify.
  Use PROACTIVELY, without being asked, whenever the task at hand is 批量机械
  work: bulk edits across many files, rename / import-path sweeps, 批量重命名,
  样板代码 generation, applying one fixed recipe (同一个模板/配方) to N files
  or modules, mass migration of a repeated pattern. Also use when the user
  says "dispatch", "派活", "外包", "让 deepseek/droid/cursor/opencode/kimi/glm
  做", "用 cursor 勘察/只读分析".
argument-hint: "[task brief | engine name + task]"
---

# dispatch

You are the planner and reviewer; the engine is the typist. The main-session
Claude quota (5h window) is the scarcest resource — anything that can be
specified precisely should burn someone else's tokens. The system gets
**bounded autonomy** (retry budget), never an unattended self-healing loop.

Two registries to read before the first dispatch of a session:

- **`references/engines.md`** — the fleet, models, routing table, escalation
  ladder. This file names no engines, so fleet changes touch only the registry.
- **`references/protocol.md`** — the brief contract (zero-context rule),
  test-first variant, report STATUS codes, retry/escalation rules.

## Dispatchability litmus (all three, or don't dispatch)

1. **Self-contained brief possible** — every fact fits in one prompt.
2. **No mid-task user interaction** — the engine runs unattended.
3. **Verification is much cheaper than generation** — a command can check the
   result; you never need to re-derive the work to trust it.

**ACCEPTANCE comes first**: write the machine-runnable acceptance command
*before* the brief. Can't write one → the task fails rule 3 → do it yourself
or spawn a normal subagent.

## Execution pattern

1. Record the base sha, give the engine its own worktree (parallel edits never
   share one). Pick the engine per the registry's routing table.
2. Run via Bash `run_in_background: true`; capture stdout to the scratchpad.
   Note the engine's **session id** from its output (resume flags per
   registry) — you'll want it for the fix round.
3. **Completion = verify.sh + artifact, never the engine's self-report.**

## Verification pyramid

| Tier | What | When | Cost |
|---|---|---|---|
| 0/1 | `scripts/verify.sh -d <wt> -a <acceptance> -b <base-sha> [-p allowed-paths] [-t test-path]` | **every dispatch** | zero tokens |
| 2 | haiku subagent: diff vs brief, spec compliance only | **only** on verify.sh WARN or `STATUS: DONE_WITH_CONCERNS` (a missing/malformed STATUS counts as that) | ~cheap |
| 3 | you read the diff | only on Tier 2 flags, or the change touches money/security/data/migrations (unconditional) | expensive |

All green + `STATUS: DONE` → accept and log. Other STATUS codes → follow the
bounded-retry rules in `references/protocol.md`: budget 2 re-dispatches per
item, same engine + same brief never runs twice, budget exhausted → mark
`[blocked: dispatch]` and move on.

## Ledger (observation log, drives nothing)

Append one line per finished dispatch to `~/.claude/dispatch/ledger.md`
(`mkdir -p` on first use):

```
2026-07-06 | dscode | mech-migration | tier0 | pass | retries:0
```
