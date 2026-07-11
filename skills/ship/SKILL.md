---
name: ship
description: >-
  Adaptive dev SOP: size the task (S/M/L), then requirement confirmation →
  planning → coding → review → 收盘. Small tasks skip ceremony; large tasks get
  the full pipeline. Chains blindspot, grill-me, advanced-plan, per-todo testing subagents,
  ponytail-review, project-level extension agents, and debrief. Trigger with
  /ship, a natural requirement, or a Gitee issue URL. Re-run in an existing
  plan worktree to resume mid-task.
argument-hint: "[requirement text | Gitee issue URL]"
---

# /ship

One skill, full cycle, sized to the task. Each stage delegates to focused sub-skills and agents.

---

## 0. Resume detection (always run first)

```bash
git worktree list | grep "advanced-plan"
```

- **Plan worktree found** → `EnterWorktree path: <that path>`, read `todo.md` Current State, jump to the right stage.
- **Nothing found** → continue to sizing.

## 0.5 Size the task

Classify by observable facts, not vibes. Announce the size and what gets skipped in one line, then proceed — don't ask for approval of the sizing itself.

| | **S** | **M** | **L** |
|---|---|---|---|
| Shape | one repo, ≤2 files, no unknowns | one repo, 3+ files, or needs exploration | multi-repo, architecture/data-structure change, or deploy-touching |
| Stage 1 grilling | 1 confirm question max | grill until settled | grill until settled |
| Plan artifacts | none | advanced-plan **light** (goal+spec+todo) | advanced-plan **full** + design.html |
| Isolation | in-place edit, no worktree | worktree | worktree per affected repo |
| Verification | self-verify (run the check yourself) | ship-tester on risky items | ship-tester per todo |
| Review | self-review the diff | ponytail-review | ponytail-review loop + optional advisor |
| 收盘 | debrief-lite (memory only if non-obvious) | debrief | debrief |

**Mid-flight escalation**: an S task that grows past 2 files or hits an unknown becomes M (create the light plan then); an M task that spawns a second repo or an architecture decision becomes L. Escalating from S: **commit the in-place edits first**, then `EnterWorktree` per advanced-plan and continue there — never leave uncommitted S edits behind. Escalate silently, note it in `unexpected.md`.

---

## Stage 1: Requirement Confirmation

### 1a. Fetch issue context (if issue URL detected)

**Extension point `issue-context`**: spawn the project's issue operator agent (e.g. kox plugin's `gitee-operator`) to fetch issue detail + comments. No such agent available → fetch via MCP tools or ask the user to paste the issue body. Merge into grilling context. Skip for plain-text requirements.

### 1b. Blind spot pass (M/L + 生疏信号 only)

Before grilling, check for 生疏信号: the requirement names no concrete files/functions, touches domain knowledge outside the repo, or the user says 不熟/不懂. Any signal on an M/L task → invoke the **`blindspot`** skill on that territory and feed its ranked briefing into the grilling questions below. S tasks: never run it.

### 1c. Grill until settled

Invoke the **`grill-me`** skill with the requirement as topic — depth per size (S: one confirm question; M/L: until every branch resolves). If grill-me is unavailable, fall back inline: one question at a time, each with a recommended answer, covering goal / affected repos / constraints / unknowns. Then declare: **"Requirement settled."**

### 1d. Create the plan (M/L only)

Invoke `advanced-plan` with the settled requirement — light tier for M, full for L. It creates `docs/advanced-plans/<date>-<slug>/{goal,spec,todo}.md` (+ the rest for full).

Ship's own additions to the plan dir:

- **`spec.md`** must include an `## Affected Repos` section (same branch name across all).
- **`exploration.md`** bootstrap: spawn the `code-search` agent per affected repo ("recent history + modules touched by <requirement>") and append its digest under `## git-context` — don't burn main context on raw `git log`.
- **`unexpected.md`** created now (template at the bottom of this file).

### 1e. Generate design.html (L only)

Invoke `html-doc` with `spec.md` as source: component diagram, key API contracts, tech decisions with one-line rationale.

**⏸ PAUSE (M/L)** — print:

> Plan ready. Review `docs/advanced-plans/<slug>/` (L: + `design.html`).
> Reply **`go`** to start coding, or give feedback to revise the spec.

S tasks don't pause — go straight to Stage 2.

---

## Stage 2: Coding

M/L: create the tmux session (persistence anchor) and ensure a worktree per affected repo on the plan branch (see `worktree` for conventions):

```bash
tmux new-session -d -s "ship-<slug>" 2>/dev/null || true
```

S: edit in place, verify, jump to Stage 3.

### Per-todo loop (M/L)

For each `todo` item (phase by phase, in order):

1. **Route, then implement** — script > dispatch > inline. First ask: can a deterministic tool do this item (`sed`/`ast-grep`/codemod/short script)? → run it directly, no engine. Otherwise run the `dispatch` litmus: all three pass → **dispatch by default** (write acceptance + brief, launch in background, continue with the next parallelizable item while it runs); any fail → implement inline yourself. A dispatched item that exhausts its retry budget comes back as `[blocked: dispatch]` in todo.md — take it inline or leave it for the wrap-up blocked summary.
2. **Verify** — L: spawn `ship-tester` for every item. M: self-verify routine items (record the evidence in `todo.md` yourself); spawn `ship-tester` only when the item is risky — touches money/security/data/migrations/external state. ship-tester writes `[PASS]` or `[FAIL + reason]` back to `todo.md`.
3. On `[FAIL]`: fix → mark `[needs-retest]` → ship-tester re-runs. No cap.
4. **`[blocked: reason]`** → only this surfaces to the user.

Phase complete when every item in it has `[PASS]`.

### Unexpected items

When an unplanned branch or missing piece appears mid-coding:

1. Append to `unexpected.md` (template below).
2. Spawn `ship-analyst` → it reads `goal.md` + `spec.md` + the item, decides, writes resolution back, updates `spec.md` if design changes.
3. Continue — no user interrupt.

Out-of-scope discoveries → note in `unexpected.md` marked `deferred`, tackle as a new `/ship` later.

---

## Stage 3: Review

All items `[PASS]` (or S task verified) → review:

1. Invoke `ponytail-review` on all files changed in this branch (S: self-review the diff instead).
2. Findings → append as a new `## Review` phase in `todo.md` → loop back to Stage 2 for that phase.
3. Exit when nothing new. L tasks touching money/security/data paths: consider `advisor` for a clean-context second opinion.

Commit + push:

```bash
git add -A
git commit -m "feat(<slug>): <one-line summary>"
git push -u origin HEAD
```

**PR: only if the user explicitly asked for one.**

---

## Stage 4: 收盘

Two halves — project landing, then knowledge sedimentation.

### 4a. Project extension points

Resolve each role against the agents/skills the current project provides; skip silently when absent:

| Role | Look for | Example (kox) | Fallback |
|---|---|---|---|
| `verify` | project E2E/frontend tester agent | `kox-frontend-tester` | ship-tester already ran |
| `deploy` | project deployer agent/skill | `k8s-deployer` | skip — deploying is opt-in |
| `finalize` | project issue-closer / merge-back skill | `kox-finalize` | commit+push from Stage 3 stands |

Resolution rule: match by role keyword in the available agent/skill descriptions (tester / deploy / finalize / 收尾), prefer project-plugin ones over global. `deploy` only fires when the user asked to ship to an environment.

### 4b. Debrief

Invoke the **`debrief`** skill (archive plan dir → distill memory → promote skill candidates). S tasks: debrief-lite — memory writeback only if something non-obvious was learned, otherwise say "nothing to sediment" and stop.

---

## unexpected.md template

```markdown
# Unexpected Items

Decisions made autonomously during coding. Review post-hoc — no user interrupt was issued.

---

## [UNX-001] <short title>

**Discovered:** <what triggered this — which file, which function, what assumption broke>
**Question:** <what needed a decision>
**Resolution:** <what was decided and why>
**Spec impact:** none | updated spec.md §<section>
**Status:** open | resolved | deferred
```
