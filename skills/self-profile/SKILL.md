---
name: self-profile
description: >-
  Profile the user from their own agent session history and render the conclusions as one chart-first HTML page.
  Use when the user invokes /self-profile or a scheduled self-review fires.
argument-hint: "[since YYYY-MM-DD | empty = since the previous run]"
metadata:
  kind: sop
---

# self-profile

The user reads this page to see themselves and to plan a career. Spare
nothing: facts over comfort, one verdict per question, no two-sided hedging.
It profiles the person, not the harness (context-audit), a project
(cto-audit) or one session (debrief).

## 1. Corpus

```bash
SELF_PROFILE_SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bun "$SELF_PROFILE_SKILL_DIR/scripts/corpus.ts"
```

It prints the run directory, `${SELF_PROFILE_DIR:-$HOME/.claude/usage-data/self-profile}/<today>/`,
holding `slice-N/` (what the user typed, oldest first) and `stats.json`.
The window starts at the previous run, or 35 days back on a first run.
Sessions driven by another agent's task cards are dropped; long tokens are
masked. Over five slices: rerun with a later `--since`.

## 2. Read

One reader agent per slice, in parallel, on the strongest model. Each reads
every part and writes `notes/slice-N.md`:

- temperament, and how instructions arrive: constraints up front or after the fact
- habits, decisions, how much is delegated and how it is checked
- strengths and gaps, down to the concrete technical point
- where the time went, career signals, recurring bad and good patterns

Every claim carries a verbatim quote, a date, a count and a confidence;
counter-examples stay in. Readers discount messages another agent wrote,
save notes every few parts, call no outside service, and never copy a
credential value.

## 3. Page

Build `profile.html` in the run directory with use-html. Conclusions and
charts only: no quotes, no evidence tables. Evidence stays in `notes/`.

- Start from the previous run's `profile.html` when one exists: keep its
  sections so runs compare, and show what moved under "known but unchanged".
- The newest slice outweighs older ones; a conflict reads "was A, now B".
- Chart numbers come from `stats.json`; label judgement scores as judgement.
- Sections: verdict (three strongest, three most costly, one career
  direction) · the year · temperament · habits · communication · capability
  with and without AI · risk · where time went · known but unchanged ·
  career (assets, where to go and where not, three to stop, three to add,
  what only the user can supply).

## 4. Close

Delete `slice-*/` and `history/`: pasted passwords survive masking. Keep
`notes/`, `stats.json`, `profile.html`. Open the page and report the verdict,
what changed since the previous run, and what the data could not show.
