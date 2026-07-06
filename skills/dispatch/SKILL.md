---
name: dispatch
description: >-
  Outsource brief-able execution work to external headless engines — the
  current fleet lives in references/engines.md (claude-binary wrappers on
  DeepSeek/Ark quota, droid, cursor-agent) — so the scarce Claude quota stays
  on planning and review. Also routes read-only 勘察/影响面分析 to cursor's
  plan mode. Smart model plans, cheap engine executes, machine checks verify.
  Use when the user says "dispatch", "派活", "外包", "让 deepseek/droid/cursor
  做", "用 cursor 勘察/只读分析", or when a plan contains bulk mechanical items
  worth offloading.
argument-hint: "[task brief | engine name + task]"
---

# dispatch

You are the planner and reviewer; the engine is the typist. The main-session
Claude quota (5h window) is the scarcest resource — anything that can be
specified precisely should burn someone else's tokens. The user supervises
loosely, not continuously: the system gets **bounded autonomy** (see retry
budget below), never an unattended self-healing loop.

Engines, models, and the escalation ladder live in **`references/engines.md`**
(the registry) — this file names no engines, so fleet changes touch only the
registry. Read the registry before the first dispatch of a session.

## Dispatchability litmus (all three, or don't dispatch)

1. **Self-contained brief possible** — every fact fits in one prompt.
2. **No mid-task user interaction** — the engine runs unattended.
3. **Verification is much cheaper than generation** — a command can check the
   result; you never need to re-derive the work to trust it.

**ACCEPTANCE comes first**: write the machine-runnable acceptance command
*before* the brief. Can't write one → the task fails rule 3 → do it yourself
or spawn a normal subagent.

## The brief contract (zero-context rule)

The engine starts with **zero conversation context**. Never write "fix the bug
we discussed". Every brief contains:

```
GOAL      one sentence, observable done-condition
CONTEXT   absolute file paths, exact error text, relevant code excerpts, branch name
CONSTRAINTS  what NOT to touch; style/idiom rules that matter
ACCEPTANCE   the command that must pass (written before this brief)
OUTPUT    worktree branch / file paths, PLUS the report contract:
          write <worktree>/.dispatch-report.md — what changed, commands run,
          and a LAST line reading exactly
          STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
```

**Test-first variant** (repos with a test harness): you write the failing
tests and commit them to the branch first; GOAL becomes "make these tests
pass"; CONSTRAINTS forbids touching the test paths (enforced by verify.sh).
The expensive tokens go into writing the contract, not reading the diff.

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
| 2 | haiku subagent: diff vs brief, spec compliance only | **only** on verify.sh WARN or `STATUS: DONE_WITH_CONCERNS` | ~cheap |
| 3 | you read the diff | only on Tier 2 flags, or the change touches money/security/data/migrations (unconditional) | expensive |

All green + `STATUS: DONE` → accept and log. A missing or malformed STATUS
line counts as `DONE_WITH_CONCERNS` (engines that ignore the protocol get the
extra check, not a pass).

## Report protocol → bounded retry

Per-item **retry budget: 2 re-dispatches** (typically one brief fix + one
escalation). Iron rule: same engine + same brief never runs twice.

- `DONE` → verification pyramid.
- `DONE_WITH_CONCERNS` (or missing STATUS) → Tier 2 check.
- `NEEDS_CONTEXT` → the brief is buggy: fix the brief, same engine (budget −1).
- `BLOCKED` or verify FAIL → escalate one rung up the registry ladder with the
  findings folded in (budget −1). Prefer re-dispatching into the **same engine
  session** (resume flag) with the consolidated fix list — one batch fix, not
  one dispatch per finding.
- **Budget exhausted → park it**: mark the item `[blocked: dispatch]` (in
  todo.md when inside /ship), move on to other items, and surface the blocked
  list to the user at wrap-up. Never stall waiting, never keep burning.

## Ledger (observation log, drives nothing)

Append one line per finished dispatch to `~/.claude/dispatch/ledger.md`
(`mkdir -p` on first use):

```
2026-07-06 | dscode | mech-migration | tier0 | pass | retries:0
```

It's for the human and for future orchestration decisions — no automation
reads it.
