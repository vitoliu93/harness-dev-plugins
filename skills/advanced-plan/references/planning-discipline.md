# Planning discipline — the four rules that decide whether the plan holds

Expansions of `new` steps 1, 3, 5 and the enforcement list. Read this while
writing `goal.md`.

## 1. Squeeze the ambiguity out at planning time

Ambiguous scope → ask *before* doing anything; a wrong north star wastes the
whole plan. Planning is where the user's time is cheap and yours is expensive:
settle it here (`grill-me` builds the decision tree) so execution runs without
interrupting them.

## 2. Pull reference sources in, then read them whole

Any artifact the work must match — prototype, design export, PRD section, sample
payload — that lives outside the repo gets copied to `$ROOT/docs/refs/<slug>/`
**first**. Worktrees, vendor subprocesses and post-compaction context can none of
them see host paths outside the repo (e.g. the Downloads folder via `${DOWNLOADS_DIR:-$HOME/Downloads}`), and a file outside git has no version to agree on.

Then read each one **end to end**. "It's large, I'll grep the relevant part" is
how a 100KB design source ends up never read by anyone. Too large for this
context → delegate one agent to distil it into an in-repo verbatim spec, and read
that.

Because `goal.md` is immutable it's also the anchor replayed after every
compaction (`plan-anchor` hook) — but replaying a path is not reading the file:
**re-open the `参考真源` before any phase that builds against it.** A summary of a
design source is not the design source.

## 3. Inherit the project's acceptance discipline before locking `goal.md`

Before writing `Done means`, grep the touched repos' `CLAUDE.md` /
`docs/**/decisions.md` for existing acceptance discipline — what must be
confirmed, by whom, what an agent may not self-certify — and either follow it or
state in the plan when superseding project acceptance rules.

## 4. Route each execute item before touching it

① A deterministic script covers it (`sed` / `ast-grep` / codemod / short script)
→ run the script, no engine. ② A whole self-contained side-task (independent
recon / tests / E2E / docs, or one that wants non-Anthropic eyes) → outsource via
the `dispatch-vendors` skill. ③ Judgment-dense (design trade-offs, sequential
probing) → implement inline in the main context.

Multi-agent `Workflow` fan-out is not a function of complexity — only for
genuinely parallel work the user opted into.
