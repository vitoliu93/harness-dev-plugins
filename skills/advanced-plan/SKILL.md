---
name: advanced-plan
description: >-
  Write the deterministic, acceptance-bearing plan for a non-trivial dev task
  and track it as a mini-project that survives context resets and handoff.
  Trigger: "advanced-plan", "立项/立个项", "开发计划", "plan this task", or
  multi-step dev work worth tracking (跟踪); resume via "continue plan",
  "恢复计划", "接着做 <slug>". Formerly write-plan — that word still
  routes here. Requires a git repo.
argument-hint: "[new <task> | resume <slug> | review <slug>]"
---

# advanced-plan

Turn a dev task into a tracked mini-project: any agent (or future-you) opens one
directory and knows what we're building, why, where we are, and what's left, with
zero prior context. Seven files, **lazy by tier** — never all seven for a
one-line fix:

| File | What it is | When |
| --- | --- | --- |
| `goal.md` | North star — locked user intent | always |
| `spec.md` | How we'll achieve it | always (3 lines is fine) |
| `todo.md` | **Live source of truth** — `Current State` cursor + phases | always |
| `preflight.md` | Infra/creds/service readiness checklist | infra/deploy tasks |
| `exploration.md` | Notebook of repo/code discoveries | lazily |
| `review.md` | Retrospective on the **agent's** process | at completion |
| `prototype.html` | **Planning's user-facing deliverable** — the target, rendered | full tier w/ design source, or any UI change → `plan-prototype` |

**Tiers.** *Light* (small localized change): `goal` + `spec` + `todo`, single
phase. *Full* (feature, refactor, multi-phase, high-risk, deploy-touching): all
applicable files. Genuinely trivial (one obvious edit)? Say so and skip the
skill.

**How to fill each file honestly is in `references/file-semantics.md` — read it
before writing them.** That's what separates a plan from paperwork.

## Preconditions & isolation (non-negotiable)

advanced-plan **only runs inside a git repo, on a dedicated worktree + branch** —
the branch *is* the plan's identity, which is what makes the plan a shareable
artifact instead of scratch files. Before any plan work:
`EnterWorktree name: "advanced-plan-<date>-<slug>"`. **One plan = one branch =
one worktree**, sharing the `<date>-<slug>` stem so all three are greppable by
one keyword. No repo → offer `git init` and stop. Plans live at
`$ROOT/docs/advanced-plans/<YYYY-MM-DD>-<slug>/`, committed on the plan's branch
— never gitignored; `debrief` archives them on close.

**`references/worktree-and-layout.md` carries the rest — read it before entering,
sharing, or removing a worktree:** discover/attach, the fixed exit-safety order
(violating it has cost work), cross-machine handoff, the multi-repo exception,
and the multi-agent lock protocol.

## Templates

**Creation = copy, then fill in** — never hand-retype the structure:

```bash
ROOT=$(git rev-parse --show-toplevel)        # multi-repo workspace task: ROOT=<workspace dir>
TPL="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}/skills/advanced-plan/assets/templates"
DIR="$ROOT/docs/advanced-plans/$(date +%F)-<slug>"
mkdir -p "$DIR"
cp "$TPL"/{goal,spec,todo}.md "$DIR"/        # light tier
cp "$TPL"/preflight.md "$DIR"/               # add if infra/deploy
```

Replace the `<...>` placeholders. Each phase in `todo.md` MUST get explicit
**acceptance criteria + verification method** filled in.

---

## Commands

### `new` — start a plan (default)

1. **Restate the goal in one or two sentences, decide the tier, settle the
   `<slug>`.** Ambiguous scope → ask *before* doing anything (`grill-me` builds
   the decision tree).
2. **Check git + enter the worktree** (see Preconditions). All following steps
   run *inside* it.
3. **Copy the reference sources into `$ROOT/docs/refs/<slug>/`, then read them
   end to end** — not grep-sampled. (Why both halves matter: rule 2 of
   `references/planning-discipline.md`.)
4. Copy the needed templates into the plan dir (see Templates).
5. **Fill `goal.md` and lock it** — inheriting the repos' existing acceptance
   discipline first (rule 3 of `references/planning-discipline.md`).
6. Fill `spec.md` (real design for full tier; a few bullets for light).
7. **Full tier with a `参考真源`, or any user-visible UI change → run
   `plan-prototype`**: show the user `prototype.html`, not the markdown. It's the
   one artifact they approve; the plan files stay agent-facing.
8. Infra/deploy/external services involved → fill `preflight.md` and **run the
   checks now**; don't defer infra failures to mid-execution.
9. Fill `todo.md`: the `Current State` cursor (record the **branch** here) +
   phases, each with acceptance criteria + verification method.
10. Commit the plan dir, tell the user the branch + first phase, then begin
    execution (or stop for approval if they want to review first).

### `execute` — do the work

Follow `todo.md` phase by phase; the Enforcement rules below are what make resume
actually work. Append discoveries to `exploration.md` as you go (lazy-copy its
template the first time). **Route each item before touching it** — deterministic
script / outsource to a vendor / implement inline: rule 4 of
`references/planning-discipline.md`.

### Routing `<args>` — new or resume?

`<args>` may be a new task or a keyword for an existing plan. **Always discover
before creating** — never silently start a duplicate. Strip the routing verbs
(`new`/`resume`/`continue`/`继续`/`恢复`/`接着做`), then discover by
worktree/branch (commands in `references/worktree-and-layout.md`): match → enter
and recover; no match → treat it as **new**. Explicit verbs override the guess —
`new <x>` always creates, `resume <x>` always searches and **reports "no plan
found"** rather than creating.

### `resume <slug>` — pick up an existing plan

Trigger: "continue plan", "恢复计划", "接着做 <slug>", or a `<kw>` that matched
above. No keyword at all? List the plan worktrees with each
`todo.md` `Current State` one-liner and ask which (loop in the reference).

**Be inside the plan's worktree**, then recover by reading `goal.md` (what) →
`spec.md` (how) → `todo.md` `Current State` (where) → skim `exploration.md` (what
we learned). Check the lock, claim the next phase, continue.

### `review <slug>` — close out (task done, "复盘这个任务")

1. Copy `review.md`'s template and run the retrospective.
2. Commit the final plan state on the branch, land the work the usual way (PR /
   merge) — the committed `docs/advanced-plans/<slug>/` rides along as the audit
   trail.
3. Invoke **`debrief`** for sedimentation — it archives the plan dir, writes the
   memory entry, and scans for skill candidates.
4. Leave the worktree only when the user asks (`ExitWorktree keep|remove`, per
   the exit-safety order). Don't auto-remove.

---

## Enforcement rules

Documents that lie are worse than no documents. Keep them honest:

1. **Update `todo.md` `Current State`** before any context-heavy work, after each
   phase, and **before stopping or handing off**. The cursor must reflect reality.
2. **No phase is `done` without verification evidence** — run the test /
   agent-browser flow, record the result. "Should work" ≠ done.
3. **Code and runtime win over docs.** Docs disagree with the code? The docs are
   wrong — fix them in the same turn you notice.
4. **`goal.md` is immutable** except append-only scope-change entries (approach
   changed → edit `spec.md`). It's the anchor replayed after compaction
   (`plan-anchor` hook), but replaying a path is not reading the file: **re-open
   the `参考真源` before any phase that builds against it.**
5. **Don't let process block small work.** Match the ceremony to the risk.
6. **Commit on the plan branch as you go** — after each phase, alongside the
   `Current State` update. Push it if another machine or agent may pick it up.

## Neighbours

`grill-me` (interview before locking `goal.md`) · `plan-prototype` (step 7) ·
`agent-browser` (default frontend verification) · `dispatch-vendors` (execute
route ②) · `debrief` (sedimentation at review) · `handoff` (point-in-time dump;
a tracked plan just points at its dir).
