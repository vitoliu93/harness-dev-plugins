---
name: worktree
description: >-
  Conventions on top of git worktrees: the branch is a unit of work's durable,
  shareable identity — any agent or machine picks it up by entering the worktree
  or checking out the branch. Covers what Claude Code already isolates
  automatically, naming, attach/resume, cross-machine handoff, parallel agents,
  and the exit-safety order. Use when the user says "开个 worktree", "隔离干活",
  "并行 agent", "按分支交接", or mentions EnterWorktree / ExitWorktree.
argument-hint: "[new <slug> | enter <branch-or-path> | exit keep|remove]"
---

# worktree

The **branch is the identity** of the work; the worktree is just a checkout of
it you can edit. Higher-level skills (`write-plan`, project ship SOPs) layer
artifacts on top of this model.

## What's already built in (don't re-do it)

Verified against current Claude Code behavior:

- **Background sessions** (`/bg`, `claude --bg`, agent view) auto-move into an
  isolated worktree under `.claude/worktrees/` **before their first file edit**.
  You don't need to arrange isolation for them.
- **Main interactive sessions and plain subagents do NOT auto-isolate** — the
  main session only via explicit `EnterWorktree`/`--worktree`; a subagent only
  via `isolation: worktree`.
- Auto-cleanup only sweeps worktrees that are old *and* clean (no uncommitted
  changes / unpushed commits); a running agent's worktree is locked.

So this skill's job is the **conventions**, not the mechanics.

## When to use / when not

- **Use** for risky, parallel, multi-step, or handoff-able work.
- **Don't** for a trivial in-place edit — a 2-minute fix doesn't need a branch.

## Create / enter

1. Require git (`git rev-parse --is-inside-work-tree`; else offer `git init`).
2. `EnterWorktree name: "<date>-<slug>"` before any work — `<slug>` = 2-4 word
   kebab-case summary; worktree, branch, and any plan slug share the same stem
   so one keyword greps all three.
3. Already inside a worktree? Reuse it — EnterWorktree refuses to nest.
4. Base ref follows the repo's `worktree.baseRef` setting; don't override
   unless asked.

## Attach to existing work (resume / handoff)

Discover by branch/worktree, not file globs:

```bash
git worktree list | grep -i "<kw>"          # live worktree?
git branch -a --list "*<kw>*"                # branch (local or remote)?
```

- Live worktree → `EnterWorktree path: <its path>`.
- Branch only → `git worktree add .claude/worktrees/<stem> <branch>`, then enter.
  (Remote-only → `git fetch` first.)
- Nothing → it's new work.

**Cross-machine**: push the branch; the other machine fetches, adds a worktree
on it, enters. Push after each meaningful checkpoint if live handoff matters.

## Commit discipline

Commit on the branch as you go — uncommitted work is invisible to every other
worktree, machine, and future session.

## Parallel agents

- **Same worktree**: each agent `EnterWorktree path:` the same path,
  coordinate via a `.lock` file (owner/lease), one writer per file.
- **Worktree per agent, same branch**: `git worktree add … <branch>` each;
  reconcile in git instead of racing on one tree.

## Exit safety (the #1 observed failure mode)

The order is fixed — violating it has caused deadlocks and lost work:

1. **Commit** (or cherry-pick out) everything you want to keep.
2. **`ExitWorktree action: "keep"`** — leave the session's pin first.
3. Merge/land the branch the normal way.
4. Only after merge: remove — `ExitWorktree action: "remove"` or
   `git worktree remove <path>` **from outside the worktree, never while a
   session is still inside it**.

Never auto-remove: an unmerged branch or uncommitted tree dies with it.
