# Commands — new, execute, resume, review

## `new` (default)

1. Restate goal, pick tier and `<slug>`. Ambiguous scope → `grill-me` first.
2. Enter worktree: `EnterWorktree name: "advanced-plan-<date>-<slug>"`. One plan = one branch = one worktree.
3. Copy reference sources to `$ROOT/docs/refs/<slug>/`; read end to end (see [planning-discipline.md](planning-discipline.md)).
4. Set `ADVANCED_PLAN_SKILL_DIR` to the absolute directory containing the loaded
   `advanced-plan/SKILL.md`; copy templates from
   `$ADVANCED_PLAN_SKILL_DIR/assets/templates` into
   `$ROOT/docs/advanced-plans/<date>-<slug>/` in the same shell command.
5. Lock `goal.md`; fill `spec.md`.
6. Full tier or UI change → `use-html` prototype mode; user approves `prototype.html`.
7. Infra/deploy → fill and run `preflight.md` now.
8. Fill `todo.md` with branch in `Current State` + phases with acceptance + verification.
9. Commit plan dir; tell user branch + first phase.

## `execute`

Follow `todo.md`; update `exploration.md` lazily. Route each item: script / vendor / inline per [planning-discipline.md](planning-discipline.md).

## Routing `<args>`

Strip `new`/`resume`/`continue`/`恢复`/`接着做`. Discover by worktree/branch ([worktree-and-layout.md](worktree-and-layout.md)). Match → resume; no match → new unless explicit `resume`.

## `resume <slug>`

Inside plan worktree: read `goal.md` → `spec.md` → `todo.md` Current State → skim `exploration.md`. Check lock; claim next phase.

## `review <slug>`

1. Copy and fill `review.md`.
2. Commit final plan state; land work (PR/merge).
3. Invoke `debrief`.
4. Exit worktree only when user asks (`ExitWorktree`, per exit-safety order).
