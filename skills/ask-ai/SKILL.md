---
name: ask-ai
description: >-
  Clean-context second opinion on a plan, design, bug, or diff — 当局者迷，旁观者清.
  Two modes: opus (clean subagent review, the default) and ultra (Claude headless
  on fable in a fresh context, for the highest stakes).
  Use when stuck after 2+ failed hypotheses, before shipping a high-stakes plan, or on
  "second opinion / ultra review / 第二意见 / 校审".
---

# Ask AI

Escalate a tough problem to a fresh reasoning pass in a clean context. Whoever is inside a problem accumulates framing bias — failed hypotheses, anchored assumptions, sunk-cost attachment. A cold reviewer with none of that history often breaks the deadlock in one shot.

## The two modes

| Mode | Engine | Execution |
|---|---|---|
| `opus` | Claude Opus, clean subagent context | the executor agent itself, spawned `model: "opus"` — no CLI |
| `ultra` | fable (Claude headless), the strongest model | `claude -p --model fable` in a fresh context |

- **`opus` — the default.** Review that needs unbiased eyes more than a different model. Fast, no CLI, live repo access through its own tools.
- **`ultra` — highest stakes.** Ship-critical decisions, problems that survived an `opus` pass, or an explicit "ultra". Strongest model, wholly separate clean context.

## Contract — mode and effort are the caller's call

The MAIN agent picks mode and effort by difficulty × importance before spawning. The spawn prompt carries three things: **mode**, **effort**, and a **self-contained brief** (below).

- Effort scale: `low` / `medium` / `high` / `xhigh` — caller-decided. Avoid `max`: too expensive for its marginal gain.
- Default: `opus` + `high`. If the caller omits mode or effort, use that and say so in the report.
- Rough map: sanity check → low/medium · genuinely hard → high · production-critical or repeatedly-failed → xhigh.

## Composing the brief (both modes)

The engine arrives cold — no conversation context. Brief it like a senior colleague who just walked in. Five sections:

1. **Framing** — what kind of problem (bug, design review, numerics, plan critique).
2. **Inputs** — exact code, config, versions; minimum repro. Plan reviews: the plan plus constraints.
3. **Expected vs actual** — specific and observable (numbers, line numbers, outputs). Plan reviews: goal and doubts.
4. **Ruled out** — hypotheses already checked wrong, so the reviewer skips dead ends.
5. **Length cap** — e.g. "under 200 words." Engines default to verbose.

A worked example lives in `references/brief-example.md`. If the spawn prompt lacks the material for these, do NOT guess — list what is missing and stop.

## Mode `opus` — review it yourself

No external engine: you were spawned on opus and ARE the reviewer. Read the referenced files (Read/Grep/Glob/Bash), reason at the effort level in the spawn prompt, form a verdict. Single pass; no consensus loop with yourself.

## Mode `ultra` — Claude headless on fable

Invocation guide (basic shape, stdin for long prompts, repo context, timeouts): **`references/claude-headless.md`**. Wire the caller's effort into `--effort`.

## Multi-round consensus (ultra plan reviews)

For plan reviews (not one-shot debugging), run one autonomous loop end to end:

```
ask → judge agree/disagree yourself → revise plan (or counter-argue) → ask again → … → consensus → report once
```

- Never pause for user confirmation between rounds.
- Converged when the engine explicitly endorses ("sound", "agreed", "no objections") or only non-blocking refinements remain.
- Cap at 5 rounds; if unconverged, report the sticking point and best candidate.
- Break early only for a genuine product/architecture trade-off the user's standing instructions don't resolve — not a mere preference; resolve those in the loop.
- Report once: converged conclusion + key points. Never relay per-round transcripts.

## After the reply

1. **Verify before acting.** The answer is a hypothesis — check it against actual code/behavior (Read/grep) when it names a code path; record verified vs hypothesis-only.
2. **Credit the engine** when the finding is non-obvious ("the fable pass suggested X — verified, that's the bug").
3. **Save a memory** if the diagnosis reveals a recurring trap.

## Don't abuse it

Every call costs tokens and attention. Not for doc lookups (find-docs / WebSearch), syntax questions, or anything the caller should reason about itself.
