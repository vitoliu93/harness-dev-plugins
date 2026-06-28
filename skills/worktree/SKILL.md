---
name: worktree
description: >-
  Isolate a unit of work in a dedicated git worktree + branch — the branch is
  that work's durable, shareable identity, and any agent or machine picks it up
  by entering the worktree or checking out the branch. Use when the user says
  "开个 worktree", "隔离干活", "并行 agent", "按分支交接", "push 给另一台机器接着做",
  or mentions EnterWorktree / ExitWorktree. Requires a git repo.
argument-hint: "[new <slug> | enter <branch-or-path> | exit keep|remove]"
---

# worktree

Isolate a piece of work on its own git worktree and branch, so it can't collide with the main checkout, can run in parallel with other work, and can be handed to another agent or machine with zero prior context. The **branch is the identity** of the work; the worktree is just a checkout of it you can edit.

This skill is the mechanism. Higher-level skills (e.g. `advanced-plan`, `ship`) layer their own artifacts on top — they all reach for the same model below.

## When to use / when not

- **Use** when work is risky, parallel, or multi-step: a feature/refactor you don't want polluting the main checkout, several agents working at once, or a task that may be handed off or resumed later.
- **Don't** bother for a trivial in-place edit — a 2-minute fix doesn't need its own worktree.
- **Background sessions that haven't isolated their changes yet:** do **not** call `EnterWorktree` (worktrees there get pruned and the work is lost). Keep the work in the main checkout instead. (See `handoff` for the canonical case.)

## Core model: one unit of work = one branch = one worktree

The branch *is* the work's identity. Keep the worktree name, branch name, and any slug on the same `<date>-<slug>` stem so one keyword greps all three. `<slug>` = a 2-4 word kebab-case summary.

## Create / enter

1. **Require git.** If `git rev-parse --is-inside-work-tree` fails, stop and offer `git init` — don't work in a non-repo.
2. **Enter a worktree before any work.** If you're on the main checkout, call **`EnterWorktree`** with `name: "<date>-<slug>"`. This creates `.claude/worktrees/<date>-<slug>/` on a new branch of the same name and switches the session into it. *Only then* start editing.
3. **Already inside a worktree?** Reuse it — `EnterWorktree` refuses to nest.

> `EnterWorktree`'s base ref follows the repo's `worktree.baseRef` setting (`fresh` = origin/default branch, `head` = current HEAD). Don't override it unless the user asks.

## Attach to an existing branch (resume / handoff)

To pick up work that already has a branch, discover by the **branch/worktree**, not a loose file glob:

```bash
git worktree list | grep -i "<kw>"          # live worktree?
git branch -a --list "*<kw>*"                # branch (local or remote)?
```

- **Live worktree matches** → `EnterWorktree path: <its path>`.
- **Branch matches, no worktree** → `git worktree add .claude/worktrees/<stem> <branch>`, then `EnterWorktree path: …`. (Remote-only branch? `git fetch` first.)
- **Nothing matches** → it's new work; create one (above).

## Cross-machine handoff

The branch is the only thing another machine can see:

- Push the branch.
- The other machine: `git fetch`, `git worktree add .claude/worktrees/<stem> <branch>`, then enter it.
- Push after each meaningful checkpoint if live cross-machine handoff matters.

## Commit discipline

Commit on the branch as you go — at minimum at each checkpoint. Another worktree or machine only sees what's committed; uncommitted work is invisible to handoff.

## Parallel agents

The branch is the shared object. Two ways to share it:

- **Same worktree** → each agent enters the *same* worktree (`EnterWorktree path: …`) and coordinates via a lock (e.g. a `.lock` file with `owner` / `lease`; one writer per file at a time). They share one working tree, so the lock matters.
- **A worktree per agent off the same branch** → `git worktree add … <branch>` each; they commit to the same branch and reconcile in git instead of racing on one tree.

## Exit

Leave only when the user asks: `ExitWorktree action: "keep"` to preserve it, or `"remove"` once the branch is merged. **Don't auto-remove** — uncommitted work or an unmerged branch would be lost.
