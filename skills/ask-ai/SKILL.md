---
name: ask-ai
description: >-
  Clean-context second opinion on a plan, design, bug, or diff — 当局者迷，旁观者清.
  Three modes: opus subagent review, Codex CLI (gpt-5.5), and ultra — the top-tier
  escalation, gpt-5.5 @ xhigh or opus-4.8 @ max (caller picks).
  Use when stuck after 2+ failed hypotheses, before shipping a high-stakes plan, or on
  "second opinion / ask codex / ask gpt / ultra review / 第二意见 / 校审".
---

# Ask AI

Escalate a tough problem to a fresh reasoning pass in a clean context. Whoever is inside a problem accumulates framing bias — failed hypotheses, anchored assumptions, sunk-cost attachment to a design. A cold reviewer with none of that history often breaks the deadlock in one shot (the 2026-04-24 dagre/Next.js bug: many wasted turns inside the session, one cold codex call found the shared object-reference mutation immediately).

## The three modes

| Mode | Engine | Execution | Effort scale |
|---|---|---|---|
| `opus` | Claude Opus, clean subagent context | the executor agent itself, spawned with `model: "opus"` — no CLI | think / think hard / ultrathink |
| `codex` | OpenAI Codex CLI, gpt-5.5 | headless `codex exec` | minimal / low / medium / high / xhigh |
| `ultra` | gpt-5.5 (codex CLI) **or** opus 4.8 (claude headless) — caller picks | `codex exec` @ xhigh — or — `claude -p --model opus` @ max | xhigh (codex leg) / max (opus leg) |

When to pick which:

- **`opus` — the default.** Plan/code review that needs unbiased eyes more than it needs a different model. Fast, no CLI dependency, and the reviewer has live repo access through its own tools.
- **`codex` — cross-vendor view.** 2+ distinct hypotheses failed, an irreconcilable contradiction (works in repro, fails in app; Node vs browser), or the deadlock may be a Claude-family blind spot. Also whenever the user says "ask codex / gpt / openai".
- **`ultra` — highest stakes, max effort.** The top-tier escalation: reserve for ship-critical architecture decisions, problems that survived an `opus` or `codex` pass, or an explicit "ultra" from the user. Caller picks the leg — **gpt-5.5 @ xhigh** (codex CLI, cross-vendor) or **opus 4.8 @ max** (claude headless, deepest Claude-family pass; `max` effort is exclusive to ultra). Expensive and slow — that is the point. (While **fable is temporarily suspended**, these stand in for it — fable was ultra's original engine; see the restore note in `references/claude-headless.md`.)

## Contract — mode and effort are the main agent's call

The MAIN agent (the caller) decides mode and effort by problem difficulty × importance, before spawning the executor. The spawn prompt must carry three things: **mode**, **effort**, and a **self-contained brief** (next section). For `ultra`, also name the leg (gpt-5.5 or opus); if unspecified, default to the opus leg. Effort rubric:

- routine sanity check → low / medium (think)
- genuinely hard problem, standard stakes → high (think hard)
- production-critical or repeatedly-failed → xhigh (ultrathink)
- existential / architecture-defining → ultra (gpt-5.5 @ xhigh, or opus 4.8 @ max — `max` is ultra-only)

If the caller omits mode or effort, default to `opus` + high and say so in the report.

## Composing the brief (all modes)

The engine arrives cold — no conversation context. Brief it like a senior colleague who just walked in. Five required sections:

1. **One-line framing** — what kind of problem (bug, design review, numerics, plan critique).
2. **Inputs** — exact code, config, versions; minimum viable repro. For plan reviews: the plan itself plus constraints.
3. **Expected vs actual** — specific and observable (numbers, line numbers, outputs). For plan reviews: the goal and the doubts.
4. **Things ruled out** — hypotheses already checked and confirmed wrong, so the reviewer doesn't re-explore dead ends.
5. **Length cap** — e.g. "Answer in under 200 words." Engines default to verbose.

Anti-patterns: a one-liner ("why is my dagre broken?"), no expected-vs-actual, no ruled-out list, no length cap. A worked example brief lives in `references/brief-example.md`.

If the spawn prompt lacks the material for these sections, do NOT guess — list exactly what is missing and stop.

## Mode `opus` — review it yourself

In this mode there is no external engine: the executor agent, spawned on opus, IS the reviewer. Do the review directly — read the referenced files (Read/Grep/Glob/Bash), reason at the effort level given by the thinking keyword in the spawn prompt, form a verdict. Single pass; no consensus loop with yourself.

## Mode `codex` — drive the Codex CLI

Full invocation guide, stdin pattern for long prompts, concurrency cap, and hung-process recovery: **`references/codex-cli.md`**. Wire effort with `-c model_reasoning_effort="<effort>"`.

## Mode `ultra` — top-tier escalation, caller picks the leg

Two engines; pick per the caller's instruction (default to the opus leg if unspecified). `max` effort is exclusive to ultra.

- **gpt-5.5 @ xhigh** — cross-vendor max. Same Codex CLI as `codex` mode at its top effort: **`references/codex-cli.md`**, with `-c model_reasoning_effort="xhigh"`.
- **opus 4.8 @ max** — deepest Claude-family pass in a fresh headless context: **`references/claude-headless.md`**, with `claude -p --model opus --effort max`.

> **Fable is temporarily suspended (2026-06-13).** Ultra normally ran Claude headless on fable (the strongest model). Until it returns, the two legs above stand in. The original fable guide is archived verbatim at `references/archive/claude-headless-fable.md` — to restore, move it back to `references/claude-headless.md` and revert the model from `opus` to `fable`.

## Multi-round consensus (codex / ultra plan reviews)

When reviewing a plan rather than one-shot debugging, the review is one autonomous loop owned end to end:

```
ask → judge agree/disagree yourself → revise plan (or counter-argue) → ask again → … → consensus → report once
```

- Never pause for user confirmation between rounds.
- Convergence: the engine explicitly endorses ("sound", "agreed", "no objections") or only non-blocking refinements remain.
- Cap at 5 rounds; if unconverged, report the sticking point and best candidate.
- Break early only for a genuine product/architecture trade-off the user's standing instructions don't resolve. A model merely preferring a different approach is not that — resolve it in the loop.
- Report once, at the end: converged conclusion + key round-trip points. Never relay per-round transcripts.

## After the reply

1. **Verify before acting.** The answer is a hypothesis, not ground truth — check it against actual code/behavior (Read/grep) when it points at a specific code path, and record verified vs hypothesis-only.
2. **Credit the engine** when the finding is non-obvious ("GPT-5.5 suggested X — verified, that's the bug").
3. **Save a memory** if the diagnosis reveals a recurring trap.

## Don't abuse it

Every call costs tokens and attention. Not for doc lookups (find-docs / WebSearch), syntax questions, or anything the user wants the main agent itself to reason about.
