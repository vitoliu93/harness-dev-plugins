---
name: advanced-plan
description: >-
  Treat a non-trivial dev task (feature, bug fix, refactor) as a tracked
  mini-project that survives context resets and cross-agent handoff. Use when the
  user says "advanced-plan", "立项", "开发计划", "plan this task", or kicks off
  multi-step dev work; also to RESUME: "continue advanced-plan", "恢复计划",
  "接着做 <slug>". Requires a git repo.
argument-hint: "[new <task> | resume <slug> | review <slug>]"
---

# advanced-plan

Turn a dev task into a tracked mini-project. The point is **not** ceremony — it's that any agent (or future-you) can open one directory and know exactly what we're building, why, where we are, and what's left, with zero prior context.

Six possible files, but **lazy by tier** — do not create all six for a one-line fix:

| File              | What it is                                              | When to create                          |
| ----------------- | ------------------------------------------------------- | --------------------------------------- |
| `goal.md`         | North star — locked user intent, concise                | always                                  |
| `spec.md`         | How we'll achieve it — implementation spec              | always (can be 3 lines for a small fix) |
| `todo.md`         | **Live source of truth** — phases + current state       | always                                  |
| `preflight.md`    | Infra/facility readiness checklist                      | only if infra/deploy/creds/external svc |
| `exploration.md`  | Running notebook of repo/code discoveries               | lazily, as you discover things          |
| `review.md`       | Post-completion retrospective on the **agent's** process | only at completion                      |

**Tiers:**
- **Light** (typo, small bug, localized change): `goal.md` + `spec.md` + `todo.md` (single phase). Skip the rest.
- **Full** (feature, refactor, anything multi-phase / high-risk / deploy-touching): all applicable files.

If the task is genuinely trivial (one obvious edit), say so and skip the skill — don't bureaucratize a 2-minute fix.

## Preconditions & isolation (non-negotiable)

advanced-plan **only runs inside a git repo, on a dedicated worktree + branch**. This is what makes the plan a real, shareable artifact instead of scratch files: the branch *is* the plan's identity, and any agent picks it up by entering the worktree or checking out the branch.

1. **Require git.** If `git rev-parse --is-inside-work-tree` fails, stop and offer `git init` — do not build a plan in a non-repo.
2. **Enter a worktree before any plan work.** If not already inside one (`git rev-parse --is-inside-work-tree` is true but you're on the main checkout), call **`EnterWorktree`** with a name derived from the slug — `name: "advanced-plan-<date>-<slug>"`. This creates `.claude/worktrees/advanced-plan-<date>-<slug>/` on a new branch of the same name and switches the session into it. *Only then* start creating files. (If already inside a worktree, reuse it — `EnterWorktree` refuses to nest.)
3. **One plan = one branch = one worktree.** The slug, branch name, and worktree name share the same `<date>-<slug>` stem so all three are greppable by the same keyword.

> `EnterWorktree`'s base ref follows the repo's `worktree.baseRef` setting (`fresh` = origin/default branch, `head` = current HEAD). Don't override it unless the user asks.

## Location & layout

Inside the plan's worktree, one directory holds the plan, committed to the plan's branch. `$ROOT` = the repo/worktree root (`git rev-parse --show-toplevel`), so the path resolves the same no matter which subdirectory you're in:

```
$ROOT/docs/advanced-plans/<YYYY-MM-DD>-<slug>/
  goal.md  spec.md  todo.md            # always (full or light)
  preflight.md                         # optional — infra/deploy tasks
  exploration.md                       # optional — or exploration-<session-id>.md when agents run concurrently
  review.md                            # optional — at completion
  .lock                                # optional — multi-agent only
```

`<slug>` = 2-4 word kebab-case summary, matching the branch/worktree stem. **Commit the plan dir on its branch** (it's the audit trail and the cross-agent channel) — never gitignore `docs/advanced-plans/`. When the branch merges to main, the dir lands in history alongside the code it produced, as first-class project docs.

**Cross-agent reach** then has exactly one model — the branch:
- **Same machine** → another agent runs `git worktree list`, finds the worktree, and `EnterWorktree path: <that path>`. The plan is right there.
- **Worktree pruned but branch kept** → `git worktree add .claude/worktrees/<stem> <branch>`, then `EnterWorktree path: …`.
- **Another machine** → push the branch; the other agent `git fetch`es, creates a worktree from it, enters. Push after each phase if live cross-machine handoff matters (see Enforcement).

## Templates

Blank templates live in `assets/templates/` (one per file). **Creation = copy, then fill in** — never hand-retype the structure. Point `TPL` at wherever the skill is installed (usually `~/.claude/skills/advanced-plan`, possibly a plugin cache):

```bash
ROOT=$(git rev-parse --show-toplevel)        # repo/worktree root — plans live with the code, on this branch
TPL=~/.claude/skills/advanced-plan/assets/templates
DIR="$ROOT/docs/advanced-plans/$(date +%F)-<slug>"
mkdir -p "$DIR"
cp "$TPL"/{goal,spec,todo}.md "$DIR"/        # light tier
cp "$TPL"/preflight.md "$DIR"/               # add if infra/deploy
```

After copying, replace the `<...>` placeholders with real content. Each phase in `todo.md` MUST get explicit **acceptance criteria + verification method** filled in.

---

## Commands

### `new` — start a plan (default action)

Trigger: "advanced-plan", "立项", "plan this task", or any non-trivial task kickoff.

1. **Restate the goal back to the user in one or two sentences, decide the tier** (light/full), and settle the `<slug>`. If scope is ambiguous, ask *before* doing anything — a wrong north star wastes the whole plan.
2. **Check git + enter the worktree** (see Preconditions). No repo → offer `git init` and stop. Then `EnterWorktree name: "advanced-plan-<date>-<slug>"`. All following steps run *inside* the worktree.
3. Copy the needed templates into `$ROOT/docs/advanced-plans/<date>-<slug>/` (see Templates above).
4. Fill `goal.md` and **lock it** — it's the north star.
5. Fill `spec.md` (real design for full tier; a few bullets for light).
6. If infra/deploy/external services are involved, fill `preflight.md` and **run the checks now** — don't defer infra failures to mid-execution.
7. Fill `todo.md`: the `Current State` cursor (record the **branch** here) + phases, each with acceptance criteria + verification method.
8. Commit the plan dir (`git add docs/advanced-plans/<date>-<slug> && git commit`), tell the user the branch + first phase, then begin execution (or stop for plan approval if the user wants to review first).

### `execute` — do the work

Follow `todo.md` phase by phase. The Enforcement rules below are non-negotiable — they're what makes resume actually work. Append discoveries to `exploration.md` as you go (lazy-copy its template the first time you need it).

### Routing `/advanced-plan <args>` — new or resume?

A bare `/advanced-plan <args>` is ambiguous (is `<args>` a new task or a keyword for an existing plan?). **Always discover before creating** — never silently start a duplicate plan. Discovery keys off the **branch/worktree**, not a loose file glob:

1. Strip routing verbs (`new` / `resume` / `continue` / `继续` / `恢复` / `接着做`) to get the keyword.
2. Look for a live worktree, then a branch:
   ```bash
   git worktree list | grep -i "$kw"                 # live worktree?
   git branch -a --list "*$kw*"                       # branch (local or remote)?
   ```
3. Decide:
   - **live worktree matches** → `EnterWorktree path: <its path>`, then recover (below).
   - **branch matches, no worktree** → `git worktree add .claude/worktrees/<stem> <branch>`, then `EnterWorktree path: …`. (Remote-only branch? `git fetch` first.)
   - **nothing matches** → treat `<args>` as a **new** task (`new` flow above).
4. Explicit verbs override the guess: `new <x>` always creates; `resume/继续 <x>` always searches and **reports "no plan found"** rather than creating.

### `resume <slug>` — pick up an existing plan

Trigger: "continue advanced-plan", "恢复计划", "接着做 <slug>", or a `/advanced-plan <kw>` that matched a worktree/branch above.

1. No keyword at all? List the advanced-plan worktrees with each `todo.md` `Current State` one-liner; ask which. Use `find` (not a bare glob — zsh aborts on no-match):
   ```bash
   for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
     td=$(find "$wt/docs/advanced-plans" -name todo.md 2>/dev/null | head -1)
     [ -n "$td" ] && printf '%s — %s\n' "$wt" "$(grep -m1 'Status' "$td")"
   done
   ```
2. **Be inside the plan's worktree** (enter it per the routing step) — that's where its `docs/advanced-plans/<slug>/` lives.
3. Read `goal.md` (what) → `spec.md` (how) → `todo.md` `Current State` (where) → skim `exploration.md` (what we learned). That's the full recovery.
4. Check the lock (see Multi-agent). Claim the next phase. Continue.

### `review <slug>` — close out

Trigger: task done, or "review advanced-plan", "复盘这个任务".

1. Copy `review.md`'s template and run the retrospective (see semantics below).
2. Commit the final plan state on the branch. Land the work the usual way (open a PR / merge the branch) — the committed `docs/advanced-plans/<slug>/` rides along as the audit trail.
3. Leave the worktree only when the user asks: `ExitWorktree action: "keep"` to preserve it, or `"remove"` once merged. Don't auto-remove — uncommitted work or an unmerged branch would be lost.

---

## What each file means (semantics)

The templates carry the structure; these are the rules for filling them honestly.

- **goal.md** — User intent, decomposed by the agent, then **locked**. Concise, unambiguous, observable "done means". Implementation choices do NOT go here (they drift) — they live in `spec.md`. Only post-creation edit is appended scope-change entries.
- **spec.md** — The approach, design, and technical decisions — and where they get **updated** if the approach changes. Approach changed? Edit spec, never goal.
- **preflight.md** (conditional) — Checklist derived from spec of required infra/creds/services. Run the checks before coding; a preflight you don't execute is theater. Record what was broken + the fix.
- **todo.md** ⭐ — The **single source of truth / save-slot**. Two parts: a `Current State` header (the live cursor a fresh agent reads to recover) and the phases. Each phase needs acceptance criteria + a concrete verification method:
  - **Frontend** → verify with `agent-browser` (navigate, interact, screenshot, assert).
  - **Backend** → unit / smoke / E2E, named explicitly.
  - **Refactor** → existing tests green + behavior unchanged (name the command).
  - A phase is `done` only after its verification has actually run and passed — record the evidence (test name, screenshot path, output). Status: `todo` → `in_progress` → `blocked` / `done`.
- **exploration.md** — Facts about the **codebase/task**, not feelings. Candidates to later graduate into project knowledge (CLAUDE.md, docs). Append under `## [session-id]`; never rewrite history. Concurrent agents each write `exploration-<session-id>.md`, merged at the end.
- **review.md** — The only file about the **agent's process**, not the code. After the task is done, analyze the agent×user collaboration. **Reuse `/cc-reflection`** for the heavy lifting — point it at this task's session-id(s) and distill its output into the template.

Boundary reminder: `exploration.md` = "what I learned about the code"; `review.md` = "what I learned about how we worked." Don't mix them.

---

## Enforcement rules (this is what makes it work)

Documents that lie are worse than no documents. Keep them honest:

1. **Update `todo.md` `Current State`:** before starting any context-heavy work, after completing each phase, and **before stopping or handing off**. The cursor must always reflect reality.
2. **No phase is `done` without verification evidence.** Run the test / agent-browser flow; record the result. "Should work" ≠ done.
3. **Code and runtime win over docs.** If `spec.md`/`todo.md` disagree with what the code actually does, the docs are wrong — fix them in the same turn you notice.
4. **`goal.md` is immutable** except append-only scope-change entries. Approach changed? Edit `spec.md`.
5. **Don't let process block small work.** Light tier exists for a reason; preflight is conditional. Match the ceremony to the risk.
6. **Commit on the plan branch as you go** — at minimum after each phase, alongside the `Current State` update, so the branch always reflects real progress. For live cross-machine handoff, `git push` after each phase too; the branch is the only thing another machine can see.

## Multi-agent collaboration

The plan branch is the shared object. How agents share it:

- **Same machine, same plan** → each agent enters the *same* worktree (`EnterWorktree path: …`) and coordinates via the lock below. They share one working tree, so the lock matters.
- **Parallel independent strands** → give each agent its own worktree off the plan branch (`git worktree add … <branch>`); they commit to the same branch and reconcile in git rather than racing on one tree.

When more than one agent shares a working tree:

- **Lock file** `docs/advanced-plans/<slug>/.lock` with `owner: <session-id>`, `since: <ts>`, `lease: <ts+TTL>`. Take it before editing shared files; release (delete) when stopping. A stale lease (past TTL) may be reclaimed — note the takeover in `exploration.md`.
- **Phase claiming:** an agent sets `Owner` + `Lease` on the phase it drives in `todo.md` `Current State`. Other agents pick a different unclaimed phase.
- **Per-session exploration files** (above) to avoid markdown append conflicts.
- **One writer per file at a time.** If two agents must touch the same source file, serialize via the lock — don't race.

## Integration with other skills

- **handoff**: advanced-plan is the persistent project record; `handoff` is a point-in-time context dump. For a tracked task, keep `todo.md` current — a handoff can just point at the `docs/advanced-plans/<slug>/` dir.
- **cc-reflection**: the engine behind `review.md` — invoke it on the task's session-id(s) rather than reinventing the analysis.
- **agent-browser**: the default frontend verification method named in phase acceptance criteria.
