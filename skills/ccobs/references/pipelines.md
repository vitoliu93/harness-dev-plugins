# Pipelines

Depth behind the three pipelines named in `SKILL.md`. Resolve `CCOBS_SKILL_DIR`
as that file shows.

## Rules digest

`scripts/rollup.ts` folds `observations.learn_candidates` into one markdown file
per project plus `_global.md`, under `${CCOBS_DIR:-$HOME/.claude/observability}/rules/`.
The SessionStart hook reads them with zero model calls.

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bun "$CCOBS_SKILL_DIR/scripts/rollup.ts" --dry-run
```

- Incremental, watermarked on `distilled_at` (never `ended_at`: distill lags and retries)
- The model only classifies new candidates as "same as rule #n" or "new"; counts and
  wording are done in code, so a hand-edited line is never reworded
- Refuses to write if the digest changed while it was merging; keeps 5 backups in `rules/.bak/`
- Rides the hourly launchd job, never the Stop hook
- After merging it sweeps each project's `.claude/LEARNED.md`: entries dated
  before that scope's watermark are deleted, so the inbox only holds what the
  pipeline hasn't caught up with

## Todo ledger

`scripts/todo.ts` keeps problems found but not handled (`todos` in obs.db).
Agents add with `add --title --why --evidence`; distill files `todo_candidates`
and closes items a session resolved (evidence required); `scripts/todo-review.ts`
runs daily at the end of the launchd chain: merges items one change fixes,
dismisses steps only the user can do, then pushes the top 3, projects over
`TODO_CAP` open items, stale items and automatic closes to Feishu
(`${CCOBS_DIR}/notify.json`). Only work an agent can finish alone is recorded.
`reopen <id>` undoes a wrong close.

An item needs a known repo and a live anchor (IK id, commit, or a repo file);
`fileTodo` rejects the rest into `todo_rejects`.

## Autopilot

`scripts/autopilot.ts` runs nightly at 01:00 (launchd `com.vito.ccobs.autopilot`),
a script state machine with no host agent. It turns open items into spec bundles,
lands them on each repo's integration branch, and deploys to test. Never production
or a Desktop release.

- Config: `${CCOBS_DIR}/autopilot/config.json` (repos, model chains, limits). Run
  `bun autopilot.ts --check-repos` after changing a repo's commands.
- Trial run: `--force --no-land --repo <name> --ids <id>`.
- Results: `${CCOBS_DIR}/autopilot/<date>/run.json` and receipts; the HTML report
  goes out with `todo-review.ts`.
- User decisions: `todo.ts decisions`, `todo.ts decide <id> <n|dismiss>`.
- Roles run in `$AUTOPILOT_WT_ROOT/<date>/`. Claude roles run headless, because
  each new worktree stops an interactive claude at the trust dialog; pi roles run
  in Herdr. launchd PATH comes from `install.sh`.
