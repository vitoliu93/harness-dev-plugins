# Worktree conventions, layout, and multi-agent coordination

The branch *is* the plan's identity; the worktree is just a checkout of it you
can edit. Read this before entering, sharing, or removing a plan worktree.

## Enter

`EnterWorktree name: "advanced-plan-<date>-<slug>"` before any plan work. **One
plan = one branch = one worktree** — slug, branch name and worktree name share
the same `<date>-<slug>` stem, so one keyword greps all three. Already inside a
worktree? Reuse it — `EnterWorktree` refuses to nest. Base ref follows the repo's
`worktree.baseRef` setting; don't override unless asked. No repo → offer
`git init` and stop (unless it's a multi-repo workspace task, below).

## Discover / attach (resume, handoff)

Discovery keys off the branch/worktree, not a file glob:

```bash
git worktree list | grep -i "<kw>"        # live worktree?
git branch -a --list "*<kw>*"              # branch, local or remote?
```

- Live worktree → `EnterWorktree path: <its path>`.
- Branch only → `git worktree add .claude/worktrees/<stem> <branch>`, then enter
  (remote-only → `git fetch` first).
- Nothing → it's new work.

Discovery is keyword-based, so pre-rename branches carrying the legacy
`write-plan-` stem still resolve.

**Cross-machine**: push the branch (after each meaningful checkpoint if live
handoff matters); the other machine fetches, adds a worktree on it, enters.

## List the plan worktrees (resume with no keyword)

Use `find`, not a bare glob — zsh aborts on no-match:

```bash
for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  td=$(find "$wt/docs/advanced-plans" -name todo.md -not -path "*/_archive/*" 2>/dev/null | head -1)
  [ -n "$td" ] && printf '%s — %s\n' "$wt" "$(grep -m1 'Status' "$td")"
done
```

## Exit safety (the #1 observed failure mode)

The order is fixed — violating it has caused deadlocks and lost work:

1. **Commit** (or cherry-pick out) everything worth keeping. Uncommitted work is
   invisible to every other worktree, machine, and future session.
2. **`ExitWorktree action: "keep"`** — drop the session's pin first.
3. Merge/land the branch the normal way.
4. Only after merge: remove — `ExitWorktree action: "remove"` or
   `git worktree remove <path>` **from outside the worktree, never while a
   session is still inside it**.

Never auto-remove: an unmerged branch or uncommitted tree dies with it. A
PreToolUse guard denies the two dangerous removals, but the order is yours to
follow.

## Layout

Inside the plan's worktree, one directory holds the plan, committed to the plan's
branch. `$ROOT` = the repo/worktree root (`git rev-parse --show-toplevel`), so
the path resolves the same from any subdirectory:

```
$ROOT/docs/advanced-plans/<YYYY-MM-DD>-<slug>/
  goal.md  spec.md  todo.md            # always (full or light)
  preflight.md                         # optional — infra/deploy tasks
  exploration.md                       # optional — or exploration-<session-id>.md when agents run concurrently
  review.md                            # optional — at completion
  .lock                                # optional — multi-agent only
```

`<slug>` = 2-4 word kebab-case summary, matching the branch/worktree stem.
**Commit the plan dir on its branch** (it's the audit trail and the cross-agent
channel) — never gitignore `docs/advanced-plans/`. When the branch merges to
main, the dir lands in history alongside the code it produced, as first-class
project docs. Closed plans get moved to
`docs/advanced-plans/_archive/<date>-<slug>/` by the `debrief` skill. (The
`advanced-plans` dir name is a fixed data convention shared with `debrief` and
project finalize skills — it deliberately does not track this skill's name;
never rename it.)

## Multi-repo tasks

When the task spans multiple git repos and the CWD is their common parent
workspace directory (a non-git dir holding the repos), there is no single branch
that can carry the plan — putting it inside one of the repos hides it from the
others' worktrees. In that case `$ROOT` = the workspace dir itself: the plan
lives at `<workspace>/docs/advanced-plans/<date>-<slug>/`, outside git and
unaffected by any worktree, physically shared by all sessions (`.lock` applies as
usual). Two compensations for what's lost: (1) no git audit trail — on close,
`debrief` moves the dir to `<workspace>/docs/advanced-plans/_archive/` instead of
relying on a merge; (2) no branch-as-discovery — keep naming discipline: every
sub-repo's branch/worktree uses the same `<date>-<slug>` stem as the plan dir, so
one keyword greps all of them. A task touching only one repo keeps the normal
rule even if launched from the workspace dir: the plan goes in that repo, on its
branch.

## Multi-agent collaboration

The plan branch is the shared object. Agents either share one worktree
(`EnterWorktree path:` the same path) or take one each off the branch
(`git worktree add … <branch>`, reconcile in git instead of racing on one tree).
What's plan-specific is coordinating on the plan files when agents share one
working tree:

- **Lock file** `docs/advanced-plans/<slug>/.lock` with `owner: <session-id>`,
  `since: <ts>`, `lease: <ts+TTL>`. Take it before editing shared files; release
  (delete) when stopping. A stale lease (past TTL) may be reclaimed — note the
  takeover in `exploration.md`.
- **Phase claiming:** an agent sets `Owner` + `Lease` on the phase it drives in
  `todo.md` `Current State`. Other agents pick a different unclaimed phase.
- **Per-session exploration files** to avoid markdown append conflicts.
- **One writer per file at a time.** If two agents must touch the same source
  file, serialize via the lock — don't race.
