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

**Copy/naming specs get exact text, then a grep assertion**: any 文案/命名/
措辞 spec item must carry the planner's verbatim final text in the brief
(never an intent description like "文案表明…"), and become a `grep` assertion
in ACCEPTANCE. Only truly semantic items (tone, style) stay un-assertable —
each such item makes the Tier 2 check unconditional (see SKILL.md pyramid).

**The gate is read-only**: the brief must declare the acceptance script/assets
untouchable — "if you believe ACCEPTANCE is wrong, report STATUS: NEEDS_CONTEXT
with your evidence; never edit the gate". Snapshot the acceptance (hash or
copy) at dispatch time; at verify, check it's unmodified before trusting any
result — a modified gate invalidates the engine's DONE even when the edit
looks reasonable (it may be right! but then the fix flows through you, not
around you).

**Enforce mechanically what can be enforced mechanically**: a constraint the
invocation can make physically impossible (env var injection like
`CCOBS_DIR=$(mktemp -d)`, readonly perms, worktree isolation) goes into the
dispatch command, not the brief. Prose constraints are only for what the
environment can't enforce — engines under long debug loops forget prose.

**Acceptance QA**: every assertion needs a verified source of truth — count
what's *rebuildable now*, not what a ledger accumulated (retention windows
skew them apart). Data-pipeline tasks get invariant assertions (date ranges,
NULL ratios), not just row counts — unit bugs ship silently through
count-only gates. Ambiguous spec words ("position", "offset", "id") get
pinned to exact expressions in the brief; a typist resolves ambiguity by
coin-flip, not by intent.

**Baseline pre-flight**: run the ACCEPTANCE command once on the base sha
*before* dispatching. If it already fails there, the baseline is dirty and an
absolute pass is unreachable — rewrite the acceptance baseline-relative:
scope it to the changed files (e.g. `eslint <files>`), or write a delta
script (base run vs HEAD run, normalized diff) and pass *that* as the
acceptance command. verify.sh only reads exit codes; normalization lives in
the command.

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
  the protocol get the extra check, not a pass). Same downgrade applies when
  the report *discloses* a known deviation, left-in defect, or gate edit but
  still says DONE — read the report body, not just the STATUS line.
- `NEEDS_CONTEXT` → the brief is buggy: fix the brief, same engine (budget −1).
- `BLOCKED` or verify FAIL → escalate one rung up the registry ladder with the
  findings folded in (budget −1). Prefer re-dispatching into the **same engine
  session** (resume flag) with the consolidated fix list — one batch fix, not
  one dispatch per finding.
- **Budget exhausted → park it**: mark the item `[blocked: dispatch]` (in
  todo.md when a plan is tracking the work), move on to other items, and surface the blocked
  list to the user at wrap-up. Never stall waiting, never keep burning.
