---
name: ship
description: >-
  Full dev SOP: requirement confirmation → planning → coding → review → push.
  Embeds inline grilling, chains advanced-plan, per-todo testing subagents, and
  ponytail-review in one flow. Trigger with a natural requirement or Gitee issue
  URL. Re-run in an existing plan worktree to resume mid-task.
argument-hint: "[requirement text | Gitee issue URL]"
---

# /ship

One skill, full cycle. Each stage delegates to focused sub-skills and agents.

---

## 0. Resume detection (always run first)

```bash
git worktree list | grep "advanced-plan"
```

- **Plan worktree found** → `EnterWorktree path: <that path>`, read `todo.md` Current State, jump to the right stage.
- **Nothing found** → start Stage 1.

---

## Stage 1: Requirement Confirmation

### 1a. Fetch issue context (if Gitee URL detected)

Spawn `gitee-operator` agent: fetch issue detail + comments. Merge into grilling context.  
Skip if plain text requirement.

### 1b. Grill until settled

Ask **one question at a time**. Give a recommended answer with each. Cover in order:

1. What is the exact goal? What does "done" look like?
2. Which repos / services are affected?
3. Any constraints (API contracts, deploy env, backwards compat)?
4. Any unknowns that need exploration before coding?

Keep asking until every branch resolves. Then declare: **"Requirement settled."**

### 1c. Create the plan

Invoke `advanced-plan` with the settled requirement. It creates:

```
docs/advanced-plans/<date>-<slug>/
  goal.md   spec.md   todo.md   exploration.md
```

Two additions /ship writes itself into the plan dir:

- **`spec.md`** must include an `## Affected Repos` section (list all repos that need changes, same branch name across all).
- **`exploration.md`** bootstrap: before coding, run `git log --oneline -50` on each affected repo and append a summary under `## git-context`.
- **`unexpected.md`** created now (template at the bottom of this file).

### 1d. Generate design.html

Invoke `html-doc` skill with `spec.md` as source. Required sections:

1. Component/module diagram — what talks to what
2. Key API contracts being added or changed (endpoints or function signatures)
3. Tech/lib decisions with one-line rationale (skip if obvious)

**⏸ PAUSE** — print:

> Plan ready. Review `docs/advanced-plans/<slug>/design.html`.  
> Reply **`go`** to start coding, or give feedback to revise the spec.

---

## Stage 2: Coding

Create the tmux session (persistence anchor):

```bash
tmux new-session -d -s "ship-<slug>" 2>/dev/null || true
```

For each worktree in "Affected Repos": ensure worktree exists on the plan branch.

### Per-todo loop

For each `todo` item (phase by phase, in order):

1. **Implement** the item.
2. **Spawn `ship-tester`** → it reads the item, designs a verification, runs it, writes `[PASS]` or `[FAIL + reason]` back to `todo.md`.
3. On `[FAIL]`: fix → mark item `[needs-retest]` → ship-tester re-runs. No cap.
4. **`[blocked: reason]`** → only this surfaces to the user.

Phase complete when every item in it has `[PASS]`.

### Unexpected items

When an unplanned branch or missing piece appears mid-coding:

1. Append to `unexpected.md` (see template below).
2. Spawn `ship-analyst` → it reads `goal.md` + `spec.md` + the item, decides, writes resolution to `unexpected.md`, updates `spec.md` if design changes.
3. Continue — no user interrupt.

New requirements discovered but out of scope for this iteration → save as a note in `unexpected.md` marked `deferred`, tackle as a new `/ship` after this one completes.

---

## Stage 3: Review

All `todo.md` items `[PASS]` → enter review loop:

1. Invoke `ponytail-review` on all files changed in this branch.
2. Findings → append as a new `## Review` phase in `todo.md`.
3. New items found → loop back to Stage 2 for that phase.
4. Exit when `ponytail-review` finds nothing new.

Commit + push:

```bash
git add -A
git commit -m "feat(<slug>): <one-line summary>"
git push -u origin HEAD
```

**PR: only if the user explicitly asked for one.**

---

## Evolution

| Change size | Path |
|---|---|
| Wording, one-liner | Edit this file or the agent directly |
| New skill/stage/agent | Run `/ship` on it — plan dir is the audit trail |
| Edge case found mid-run | Append to `unexpected.md` as `deferred`; review after task ships |

Known edge cases land in `## Known Limitations` below. Recurrent ones become fixes.

## Known Limitations

<!-- Append edge cases here as they surface. Format: `- [date] <symptom> — <workaround or fix pending>` -->

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
