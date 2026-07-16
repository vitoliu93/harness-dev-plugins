---
name: write-plan
description: >-
  Write the deterministic, acceptance-bearing plan for a non-trivial dev task
  and track it as a mini-project that survives context resets and handoff.
  Trigger: "write-plan", "立项/立个项", "开发计划", "plan this task", or
  multi-step dev work worth tracking (跟踪); resume via "continue plan",
  "恢复计划", "接着做 <slug>". Formerly advanced-plan — that word still
  routes here. Requires a git repo.
argument-hint: "[new <task> | resume <slug> | review <slug>]"
---

# write-plan

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

write-plan **only runs inside a git repo, on a dedicated worktree + branch** — that's what makes the plan a shareable artifact instead of scratch files: the branch *is* the plan's identity, and any agent picks it up by entering the worktree or checking out the branch. The worktree/branch mechanics live in the **`worktree`** skill; write-plan adds only the naming convention below.

Before any plan work: `EnterWorktree name: "write-plan-<date>-<slug>"`, then start creating files. **One plan = one branch = one worktree** — the slug, branch name, and worktree name share the same `<date>-<slug>` stem so all three are greppable by one keyword. (No repo → offer `git init` and stop — unless it's a multi-repo workspace task, see Location below. See `worktree` for nesting, baseRef, and resume.)

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

`<slug>` = 2-4 word kebab-case summary, matching the branch/worktree stem. **Commit the plan dir on its branch** (it's the audit trail and the cross-agent channel) — never gitignore `docs/advanced-plans/`. When the branch merges to main, the dir lands in history alongside the code it produced, as first-class project docs. Closed plans get moved to `docs/advanced-plans/_archive/<date>-<slug>/` by the `debrief` skill. (The `advanced-plans` dir name is a fixed data convention shared with `debrief` and project finalize skills — it deliberately does not track this skill's name; never rename it.)

**Multi-repo tasks**: when the task spans multiple git repos and the CWD is their common parent workspace directory (a non-git dir holding the repos), there is no single branch that can carry the plan — putting it inside one of the repos hides it from the others' worktrees. In that case `$ROOT` = the workspace dir itself: the plan lives at `<workspace>/docs/advanced-plans/<date>-<slug>/`, outside git and unaffected by any worktree, physically shared by all sessions (`.lock` applies as usual). Two compensations for what's lost: (1) no git audit trail — on close, `debrief` moves the dir to `<workspace>/docs/advanced-plans/_archive/` instead of relying on a merge; (2) no branch-as-discovery — keep naming discipline: every sub-repo's branch/worktree uses the same `<date>-<slug>` stem as the plan dir, so one keyword greps all of them. A task touching only one repo keeps the normal rule even if launched from the workspace dir: the plan goes in that repo, on its branch.

**Cross-agent reach** has exactly one model — the branch: another agent finds the worktree/branch and enters it, and the plan dir is right there. The discovery + cross-machine handoff mechanics are in the **`worktree`** skill. (Multi-repo plans are the exception: discovery is by the shared slug stem, per above.)

## Templates

Blank templates live in `assets/templates/` (one per file). **Creation = copy, then fill in** — never hand-retype the structure. `TPL` resolves for both install shapes (plugin cache via `CLAUDE_PLUGIN_ROOT`, or `~/.claude/skills`):

```bash
ROOT=$(git rev-parse --show-toplevel)        # repo/worktree root — plans live with the code, on this branch
                                             # multi-repo workspace task: ROOT=<workspace dir> instead (see Location)
TPL="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}/skills/write-plan/assets/templates"
DIR="$ROOT/docs/advanced-plans/$(date +%F)-<slug>"
mkdir -p "$DIR"
cp "$TPL"/{goal,spec,todo}.md "$DIR"/        # light tier
cp "$TPL"/preflight.md "$DIR"/               # add if infra/deploy
```

After copying, replace the `<...>` placeholders with real content. Each phase in `todo.md` MUST get explicit **acceptance criteria + verification method** filled in.

---

## Commands

### `new` — start a plan (default action)

Trigger: "write-plan", "立项", "plan this task", or any non-trivial task kickoff.

1. **Restate the goal back to the user in one or two sentences, decide the tier** (light/full), and settle the `<slug>`. If scope is ambiguous, ask *before* doing anything — a wrong north star wastes the whole plan.
2. **Check git + enter the worktree** (see Preconditions). No repo → offer `git init` and stop. Then `EnterWorktree name: "write-plan-<date>-<slug>"`. All following steps run *inside* the worktree.
3. Copy the needed templates into `$ROOT/docs/advanced-plans/<date>-<slug>/` (see Templates above).
4. Fill `goal.md` and **lock it** — it's the north star.
5. Fill `spec.md` (real design for full tier; a few bullets for light).
6. If infra/deploy/external services are involved, fill `preflight.md` and **run the checks now** — don't defer infra failures to mid-execution.
7. Fill `todo.md`: the `Current State` cursor (record the **branch** here) + phases, each with acceptance criteria + verification method.
8. Commit the plan dir (`git add docs/advanced-plans/<date>-<slug> && git commit`), tell the user the branch + first phase, then begin execution (or stop for plan approval if the user wants to review first).

### `execute` — do the work

Follow `todo.md` phase by phase. The Enforcement rules below are non-negotiable — they're what makes resume actually work. Append discoveries to `exploration.md` as you go (lazy-copy its template the first time you need it).

**Route each item before touching it**: ① deterministic script covers it (`sed`/`ast-grep`/codemod/short script) → run the script, no engine; ② a whole self-contained side-task (independent recon/tests/E2E/docs, or wants non-Anthropic eyes) → outsource via the `dispatch-vendors` skill; ③ judgment-dense (design trade-offs, sequential probing) → implement inline in the main context. Multi-agent `Workflow` fan-out is not a function of complexity — only for genuinely parallel work the user opted into.

### Routing `/write-plan <args>` — new or resume?

A bare `/write-plan <args>` is ambiguous (is `<args>` a new task or a keyword for an existing plan?). **Always discover before creating** — never silently start a duplicate plan. Discovery keys off the **branch/worktree**, not a loose file glob:

1. Strip routing verbs (`new` / `resume` / `continue` / `继续` / `恢复` / `接着做`) to get the keyword.
2. Discover an existing plan by its worktree/branch — use the discovery + attach steps in the **`worktree`** skill (`git worktree list` / `git branch -a`, then `EnterWorktree`).
3. Decide:
   - **worktree or branch matches** → enter it (per `worktree`), then recover (below).
   - **nothing matches** → treat `<args>` as a **new** task (`new` flow above).
4. Explicit verbs override the guess: `new <x>` always creates; `resume/继续 <x>` always searches and **reports "no plan found"** rather than creating.

### `resume <slug>` — pick up an existing plan

Trigger: "continue plan", "恢复计划", "接着做 <slug>", or a `/write-plan <kw>` that matched a worktree/branch above.

1. No keyword at all? List the plan worktrees with each `todo.md` `Current State` one-liner; ask which. Use `find` (not a bare glob — zsh aborts on no-match):
   ```bash
   for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
     td=$(find "$wt/docs/advanced-plans" -name todo.md -not -path "*/_archive/*" 2>/dev/null | head -1)
     [ -n "$td" ] && printf '%s — %s\n' "$wt" "$(grep -m1 'Status' "$td")"
   done
   ```
2. **Be inside the plan's worktree** (enter it per the routing step) — that's where its `docs/advanced-plans/<slug>/` lives.
3. Read `goal.md` (what) → `spec.md` (how) → `todo.md` `Current State` (where) → skim `exploration.md` (what we learned). That's the full recovery.
4. Check the lock (see Multi-agent). Claim the next phase. Continue.

### `review <slug>` — close out

Trigger: task done, or "review the plan", "复盘这个任务".

1. Copy `review.md`'s template and run the retrospective (see semantics below).
2. Commit the final plan state on the branch. Land the work the usual way (open a PR / merge the branch) — the committed `docs/advanced-plans/<slug>/` rides along as the audit trail.
3. Invoke the **`debrief`** skill for sedimentation — it archives the plan dir, writes the memory entry, and scans for skill candidates.
4. Leave the worktree only when the user asks (`ExitWorktree keep|remove`, see `worktree`) — `keep` to preserve, `remove` once merged. Don't auto-remove.

---

## What each file means (semantics)

The templates carry the structure; these are the rules for filling them honestly.

- **goal.md** — User intent, decomposed by the agent, then **locked**. Concise, unambiguous, observable "done means". Implementation choices do NOT go here (they drift) — they live in `spec.md`. Only post-creation edit is appended scope-change entries. Write it reader-first: plain language aligned to the goal, not the code — someone far from the code (the user) must grasp it at a glance; code references belong in todo.md `Verify` fields, never here.
- **spec.md** — The approach, design, and technical decisions — and where they get **updated** if the approach changes. Approach changed? Edit spec, never goal.
- **preflight.md** (conditional) — Checklist derived from spec of required infra/creds/services. Run the checks before coding; a preflight you don't execute is theater. Record what was broken + the fix.
- **todo.md** ⭐ — The **single source of truth / save-slot**. Two parts: a `Current State` header (the live cursor a fresh agent reads to recover) and the phases. Each phase needs acceptance criteria + a concrete verification method:
  - **Frontend** → verify with `agent-browser` (navigate, interact, screenshot, assert).
  - **Backend** → unit / smoke / E2E, named explicitly.
  - **Refactor** → existing tests green + behavior unchanged (name the command).
  - A phase is `done` only after its verification has actually run and passed — record the evidence (test name, screenshot path, output). Status: `todo` → `in_progress` → `blocked` / `done`.
- **exploration.md** — Facts about the **codebase/task**, not feelings. Candidates to later graduate into project knowledge (CLAUDE.md, docs). Append under `## [session-id]`; never rewrite history. Concurrent agents each write `exploration-<session-id>.md`, merged at the end.
- **review.md** — The only file about the **agent's process**, not the code. After the task is done, analyze the agent×user collaboration over this task's session-id(s) — what worked, what caused rework, what to do differently next time — and distill it into the template.

Boundary reminder: `exploration.md` = "what I learned about the code"; `review.md` = "what I learned about how we worked." Don't mix them.

---

## Enforcement rules (this is what makes it work)

Documents that lie are worse than no documents. Keep them honest:

1. **Update `todo.md` `Current State`:** before starting any context-heavy work, after completing each phase, and **before stopping or handing off**. The cursor must always reflect reality.
2. **No phase is `done` without verification evidence.** Run the test / agent-browser flow; record the result. "Should work" ≠ done.
3. **Code and runtime win over docs.** If `spec.md`/`todo.md` disagree with what the code actually does, the docs are wrong — fix them in the same turn you notice.
4. **`goal.md` is immutable** except append-only scope-change entries. Approach changed? Edit `spec.md`.
5. **Don't let process block small work.** Light tier exists for a reason; preflight is conditional. Match the ceremony to the risk.
6. **Commit on the plan branch as you go** — at minimum after each phase, alongside the `Current State` update, so the branch always reflects real progress. (Commit/push discipline + cross-machine handoff: see `worktree`.)

## Multi-agent collaboration

The plan branch is the shared object — how agents share a worktree vs. take one each off the branch is in the **`worktree`** skill (Parallel agents). What's plan-specific is coordinating on the plan files when agents share one working tree:

- **Lock file** `docs/advanced-plans/<slug>/.lock` with `owner: <session-id>`, `since: <ts>`, `lease: <ts+TTL>`. Take it before editing shared files; release (delete) when stopping. A stale lease (past TTL) may be reclaimed — note the takeover in `exploration.md`.
- **Phase claiming:** an agent sets `Owner` + `Lease` on the phase it drives in `todo.md` `Current State`. Other agents pick a different unclaimed phase.
- **Per-session exploration files** (above) to avoid markdown append conflicts.
- **One writer per file at a time.** If two agents must touch the same source file, serialize via the lock — don't race.

## Integration with other skills

- **worktree**: the isolation/branch mechanism write-plan runs on — entering, resuming, cross-machine handoff, parallel agents. write-plan adds the plan dir and the `write-plan-<date>-<slug>` naming on top (pre-rename branches carry the legacy `advanced-plan-` stem; discovery is keyword-based, so both resolve).
- **handoff**: write-plan is the persistent project record; `handoff` is a point-in-time context dump. For a tracked task, keep `todo.md` current — a handoff can just point at the `docs/advanced-plans/<slug>/` dir.
- **agent-browser**: the default frontend verification method named in phase acceptance criteria.
