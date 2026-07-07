---
name: blindspot
description: >-
  Blind spot pass — surface the unknown unknowns in territory you don't know,
  before any plan exists: scan the codebase modules and out-of-repo domain
  knowledge a task touches, return a ranked briefing of the 5-10 things you'd
  never think to ask — hidden couplings, existing conventions, landmines,
  prior art. Use when the user says "blind spot pass", "盲区扫描", "扫一下盲区",
  "这块我不熟 / 我不懂 X", or hands over a task in unfamiliar territory. ship
  chains this in Stage 1 for M/L tasks with 生疏信号. Briefing only — never
  plans, never edits. Not for stress-testing an existing plan (that's grill-me,
  the inverse direction: it questions YOUR plan; blindspot questions the
  territory FOR you).
argument-hint: "[task + the territory you're blind on]"
---

# /blindspot

The map is the prompt; the territory is the code and its domain. This skill reports
the gap — what the territory knows that the prompt doesn't. (After Thariq's
"A Field Guide to Fable: Finding Your Unknowns".)

## 1. Frame the map

One line, no interview: restate what the prompt already establishes (the known
knowns), then name the lenses to scan — which repo modules, and which domain
topics outside the repo (protocols, formats, third-party APIs, regulations).
Domain lens only exists when the task actually leans on knowledge the repo
doesn't contain.

## 2. Scan the territory (delegated, parallel)

Main context orchestrates only — raw code and web dumps never enter it. Spawn
all scans in one message:

- **Repo lens** — `code-search` agent, one per affected module/repo:

  > Task context: <task>. I need the blind spots of someone about to work here
  > who has never read this code. Report: (a) conventions and idioms this area
  > enforces, (b) hidden couplings — what else breaks or must change when this
  > area changes, (c) prior art — existing helpers/patterns that already do
  > part of the task, (d) landmines from git history — past reverts, fix-loops,
  > TODO/HACK clusters. Digest only, cite file:line.

- **Domain lens** — `general-skills-executor` (model: sonnet) running exa-code,
  one per domain topic:

  > Task context: <task>. Report the pitfalls, spec constraints, and
  > commonly-missed edge cases of <topic> that a non-specialist implementing
  > this would not think to ask about. Digest + sources only.

## 3. Rank and brief

Merge the digests into **5–10 items max**. An item qualifies only if it is
absent from the user's prompt — if they already mentioned it, it's a known,
not a blind spot. Rank by plan impact:

1. constraints that change the data model or architecture
2. prior art that changes the whole approach ("this half-exists already")
3. conventions whose violation means rework
4. minor gotchas

Format: one line each — `[repo|domain]` **the thing you didn't know** — why it
would change your plan. Cite file:line or source.

## 4. Stop

Briefing delivered, turn ends. No plan, no edits, no follow-up interview —
the user reacts, then chains `/grill-me` or `/ship` themselves (or ship
called us and takes the briefing back into its grilling).
