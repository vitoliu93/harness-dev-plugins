---
name: advanced-plan
description: >-
  Write and track a deterministic, acceptance-bearing dev plan as a mini-project.
  Use when starting or resuming multi-step dev work, or the user says 立项/开发计划/plan this task/恢复计划.
argument-hint: "[new <task> | resume <slug> | review <slug>]"
metadata:
  kind: sop
---

# advanced-plan

Turn a dev task into a tracked mini-project under `$ROOT/docs/advanced-plans/<date>-<slug>/`.
Seven files, lazy by tier — see [file-semantics.md](references/file-semantics.md).

| Tier | files |
|---|---|
| light | goal + spec + todo |
| full | + preflight / exploration / review / prototype.html when applicable |

## Hard gates

- Git repo required. **One plan = one worktree + branch** (`advanced-plan-<date>-<slug>`).
- No repo → offer `git init` and stop.
- Worktree rules: [worktree-and-layout.md](references/worktree-and-layout.md).

## Templates

```bash
ROOT=$(git rev-parse --show-toplevel);
ADVANCED_PLAN_SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
TPL="$ADVANCED_PLAN_SKILL_DIR/assets/templates";
DIR="$ROOT/docs/advanced-plans/$(date +%F)-<slug>";
mkdir -p "$DIR" && cp "$TPL"/{goal,spec,todo}.md "$DIR"/
```

## Commands

Full flows: [commands.md](references/commands.md). Planning discipline: [planning-discipline.md](references/planning-discipline.md).

## Enforcement

1. Update `todo.md` Current State before heavy work, after each phase, before handoff.
2. No phase `done` without verification evidence.
3. Code/runtime wins over docs — fix docs same turn.
4. `goal.md` immutable except append-only scope changes; re-open `参考真源` after compaction.
5. Match ceremony to risk.
6. Commit on plan branch after each phase.

## Neighbours

`grill-me` · `use-html` prototype · `orchestrate` · `debrief` · `take-over`
