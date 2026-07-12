---
name: dispatch
description: >-
  Outsource brief-able execution to cheap headless engines (fleet in
  references/engines.md) so Claude quota stays on planning and review; truly
  scriptable work routes to sed/ast-grep/codemod first, read-only 勘察/影响面
  分析 to cursor plan mode. Use PROACTIVELY on 批量机械 work: bulk edits,
  rename/import-path sweeps, 批量重命名, 样板代码, one fixed recipe applied
  to N files, mass migration. Also on "dispatch", "派活", "外包", "让
  deepseek/droid/cursor/opencode/kimi/glm 做", "用 cursor 勘察/只读分析".
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

## Rung 0: script before engine

Before the litmus, ask: **can a deterministic tool do this?** `sed`,
`ast-grep` (installed), `jq`, a codemod, a 20-line script — if the recipe is
truly fixed, run it directly: instant, zero tokens, nothing to verify beyond
the tool's own output. A utility that closes the gap is fair game to install
(homebrew / uv tool / bun — no approval needed). Only what survives this rung
— brief-able but **not** script-able — is dispatch material. An engine is for
the middle band: too fuzzy for sed, too mechanical for you.

## Dispatchability litmus (all three, or don't dispatch)

1. **Self-contained brief possible** — every fact fits in one prompt.
2. **No mid-task user interaction** — the engine runs unattended.
3. **Verification is much cheaper than generation** — a command can check the
   result; you never need to re-derive the work to trust it.

**ACCEPTANCE comes first**: write the machine-runnable acceptance command
*before* the brief. Can't write one → the task fails rule 3 → do it yourself
or spawn a normal subagent. Then **pre-flight it on the base sha**: if it
already fails there the baseline is dirty — rewrite it baseline-relative per
`references/protocol.md` before dispatching.

## Execution pattern

1. Record the base sha, give the engine its own worktree (parallel edits never
   share one). Pick the engine per the registry's routing table.
1.5. **Pilot first on fan-outs** (same recipe × N≥5 files/modules): dispatch
   ONE representative item, run tier-0 verify on it, and only then fan out the
   remaining N−1 with the proven brief. A brief defect costs 1/N instead of a
   full run + a retry — the retry budget is for surprises, not for debugging
   the brief at scale.
2. Run via Bash `run_in_background: true`; capture stdout to the scratchpad.
   Note the engine's **session id** from its output (resume flags per
   registry) — you'll want it for the fix round.
3. **Completion = verify.sh + artifact, never the engine's self-report.**

## Verification pyramid

| Tier | What | When | Cost |
|---|---|---|---|
| 0/1 | `scripts/verify.sh -d <wt> -a <acceptance> -b <base-sha> [-p <globs-file>] [-t test-path]` | **every dispatch** | zero tokens |
| 2 | haiku subagent: diff vs brief, spec compliance only | verify.sh WARN, `STATUS: DONE_WITH_CONCERNS` (a missing/malformed STATUS counts as that), or the brief has ≥1 spec item that couldn't be turned into a machine assertion (unconditional) | ~cheap |
| 3 | you read the diff | only on Tier 2 flags, or the change touches money/security/data/migrations (unconditional) | expensive |

`-p` takes a *file* of glob patterns (one per line, `#` comments ok), not a
space-separated path list.

All green + `STATUS: DONE` → accept and log. Other STATUS codes → follow the
bounded-retry rules in `references/protocol.md`: budget 2 re-dispatches per
item, same engine + same brief never runs twice, budget exhausted → mark
`[blocked: dispatch]` and move on.

## Ledger

Append one line per finished dispatch to `~/.claude/dispatch/ledger.md`
(`mkdir -p` on first use). `tier` = the **terminal** tier (the one that
actually settled it); note inline fixups honestly — they are the cost the
pyramid failed to catch:

```
2026-07-06 | dscode | mech-migration | tier0 | pass | retries:0
2026-07-11 | dscode | kb-rename | tier3 | pass(+1 inline fixup) | retries:0
```

Consumer: `debrief` reads it at 收盘. If the terminal tier is repeatedly 3
with inline fixups, the routing is mis-calibrated — the tasks being dispatched
carry more judgment than the litmus admits; tighten the litmus or route those
inline, don't keep paying tier-3 tax and calling it savings.
