# dispatch protocol — brief contract & retry rules

Read this before writing the first brief of a session.

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

## Report protocol → bounded retry

Per-item **retry budget: 2 re-dispatches** (typically one brief fix + one
escalation). Iron rule: same engine + same brief never runs twice.

- `DONE` → verification pyramid.
- `DONE_WITH_CONCERNS` (or missing STATUS) → Tier 2 check. A missing or
  malformed STATUS line counts as `DONE_WITH_CONCERNS` (engines that ignore
  the protocol get the extra check, not a pass).
- `NEEDS_CONTEXT` → the brief is buggy: fix the brief, same engine (budget −1).
- `BLOCKED` or verify FAIL → escalate one rung up the registry ladder with the
  findings folded in (budget −1). Prefer re-dispatching into the **same engine
  session** (resume flag) with the consolidated fix list — one batch fix, not
  one dispatch per finding.
- **Budget exhausted → park it**: mark the item `[blocked: dispatch]` (in
  todo.md when inside /ship), move on to other items, and surface the blocked
  list to the user at wrap-up. Never stall waiting, never keep burning.
