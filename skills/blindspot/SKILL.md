---
name: blindspot
description: >-
  Blind spot pass before any plan exists: scan the repo modules and domain
  knowledge a task touches, return a ranked briefing of 5-10 unknown unknowns
  — hidden couplings, conventions, landmines, prior art. Trigger: "blind spot
  pass", "盲区扫描", "扫一下盲区", "这块我不熟 / 我不懂 X", or a task in
  unfamiliar territory; ship SOPs chain it for M/L tasks with 生疏信号.
  Briefing only — no plans, no edits. Stress-testing an existing plan is
  grill-me, not this.
argument-hint: "[task + the territory you're blind on]"
---

# /blindspot

The prompt is a map; the code and its domain are the territory. Every gap
between them is an **unknown** the executing agent will fill with a best
guess — and accumulated wrong guesses are how long tasks derail. Of the four
kinds of unknowns (known knowns are in the prompt; known unknowns the user
can just ask about; unknown knowns surface when reacting to a draft), this
pass hunts the last and worst: **unknown unknowns — the questions the user
wouldn't think to ask, the potholes, the prior art, and what "good" even
looks like here**. Finding them now is cheap; finding them after the plan
commits to a wrong guess is rework. The briefing exists so the user can
prompt and plan better. (Distilled from Thariq's "A Field Guide to Fable:
Finding Your Unknowns".)

## 1. Frame the map

One line, no interview: restate what the prompt already establishes (the known
knowns), then name the lenses to scan — which repo modules, and which domain
topics outside the repo (protocols, formats, third-party APIs, regulations).
Domain lens only exists when the task actually leans on knowledge the repo
doesn't contain. What the user discloses about their own experience
calibrates the pass: what they say they know is off the list; what they
admit they don't know widens where to scan.

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

  > Task context: <task>. Report the pitfalls, spec constraints,
  > commonly-missed edge cases of <topic> that a non-specialist implementing
  > this would not think to ask about — and what "good" looks like: the
  > quality ceiling a non-specialist wouldn't know to aim for. Digest +
  > sources only.

## 3. Rank and brief

Merge the digests into **5–10 items max**. An item qualifies only if it is
absent from the user's prompt — if they already mentioned it, it's a known,
not a blind spot. Rank by plan impact — i.e. how expensive the wrong guess
would be if nobody flagged it:

1. constraints that change the data model or architecture
2. prior art that changes the whole approach ("this half-exists already")
3. conventions whose violation means rework
4. minor gotchas

Format: one line each — `[repo|domain]` **the thing you didn't know** — why it
would change your plan. Cite file:line or source.

## 4. Stop

Briefing delivered, turn ends. No plan, no edits, no follow-up interview —
the user reacts, then chains `/grill-me` or their project ship SOP themselves
(or a ship SOP called us and takes the briefing back into its grilling).
