# The research method — deep dive

Detailed guidance for the six moves in `SKILL.md`. Read this for any non-trivial study. The running example is the **BGM reverse** research from `short-video-reverse` (`docs/BGM-反解-技术选型.md`), a clean instance of the whole arc.

The method is the operational form of Anthropic's documented research guidance:

> Search in a structured way. As you gather data, develop several competing hypotheses. Track your confidence levels in your progress notes to improve calibration. Regularly self-critique your approach and plan. Update a hypothesis tree or research notes file to persist information and provide transparency. Break down this complex research task systematically.

Two stances held at once — **Scholar** (gather, verify, synthesize) and **Architect** (estimate, de-risk, decide). The Scholar enforces honesty about what is known; the Architect keeps the work moving toward a buildable choice.

---

## Move 1 — Frame

**Write success criteria before searching.** Without them, research expands forever and every source looks relevant. A good criterion is checkable: "we recommend one approach with a named residual risk", "the approach hits ≥X on metric M", "we can answer: is this feasible in our stack?".

**Decompose the question.** The single most common failure is treating a compound problem as one atom.

> *BGM example.* The trap: "do BGM" = "find a BGM-recognition model." The reframe: BGM reverse is a **three-part pipeline**, each answering a different question and mapping to a different output field —
> - **A. Separate** — pull background music out of the voice+SFX mix (prerequisite, no output field).
> - **B. Identify** — what style / which library track is most alike (→ `audio_url`).
> - **C. Characterize** — volume curve, in/out timing, beat-alignment (→ `volume`/`start`/`end`).
>
> The reframe surfaced the key insight: *most of the hard eval metrics live in C, not B.* Fixating on "recognize the song" would have missed the quantifiable signal entirely. That insight is impossible without decomposition.

Record sub-questions in `question.md`. Each should be researchable independently.

## Move 2 — Gather

**Cast wide, then verify narrow.** Use several angles — they surface different things:
- `find-docs` — authoritative, current API/behavior. The default for "what does this tool *actually* do."
- `exa-code` — real implementations across GitHub/SO/docs ("how do people do this").
- `WebSearch` / `WebFetch` — papers, announcements, version-specific notes.
- `qmd query <subject>` — the personal knowledge base; prior research may already answer part of it.
- the codebase itself, and any `papers/` already collected.

**The verification rule (non-negotiable).** Never let a single source — especially memory or one StackOverflow post — become a "finding." Cross-check against the actual docs or source. An unverified "X supports Y" is a *hypothesis* (goes in `notes.md`), not a fact. This is the same discipline as "read the actual docs, don't guess."

**Source-verification checklist** for each entry in `sources.md`:
- [ ] Primary source read (not a summary of a summary)?
- [ ] Version / date checked — is this still true in the current version?
- [ ] Cross-checked against ≥1 independent source? Conflicts logged?
- [ ] Maturity honestly tagged (✅ production / ⚠️ weak / ❌ none)?

**Prioritize into tiers + a reading route.** Don't read depth-first into the first paper. Read the framing docs, then the core options, then niche depth. Record the route so a resuming agent reads in the same order.

## Move 3 — Hypothesize

**Build a hypothesis tree, not a single guess.** List the competing approaches as branches; for each, the claim, current confidence, and evidence for/against. Competing hypotheses keep you from anchoring on the first plausible option.

> *BGM example — the B fork.* Identification split into two genuinely different hypotheses, because they *answer different questions*:
>
> | | B1 audio fingerprint | B2 CLAP semantic retrieval |
> |-|-|-|
> | tool | SeekTune / neural-music-fp | LAION-CLAP |
> | answers | "is this the **same recording**?" | "**sounds/feels** most like which track?" |
> | two songs, same mood, diff track | no match | vectors still close |
>
> Both noted with confidence levels, both kept open until evidence decided.

**Confidence calibration.** Use low/med/high and mean it. Over-confidence hides risk; under-confidence stalls decisions. The output that matters most here: **name the single biggest uncertainty** — the assumption that, if false, collapses the whole approach. In BGM that was: *"will CLAP audio→audio retrieval actually be good enough on our specific 749-track library?"* — honestly flagged as the one thing nobody was sure of. Everything else (Demucs, librosa) was known-safe.

Survey the full option space in `landscape.md` with maturity + risk + fit-to-criteria per option, so the decision is made *from a map*, not from whichever option you happened to read last.

## Move 4 — De-risk

**Order by de-risk priority, not easy-first.** The instinct is to do the simple, certain parts first because they feel productive. Resist it. Spend the **cheapest experiment that punctures the biggest unknown** — because if the riskiest assumption is false, everything built on the easy parts is wasted.

> *BGM example — the ordering.*
>
> | order | action | why |
> |-|-|-|
> | **1st** | build *only* a CLAP index + a few query top-k retrievals, **listen by ear** | cheapest probe that stabs the biggest unknown |
> | parallel | stand up Demucs (A) + librosa (C) | known to work, zero risk, progress in parallel |
> | after | assemble the structured output | only once the unknown is settled |
>
> Branch on the result: **行** (works) → confirm B2, continue. **不行** → swap audio→audio to MERT, keep CLAP for text tagging.
>
> *Result (M0):* 83 samples — CLAP top-5 same-class hit 0.83 vs 0.34 random, ear-confirmed → took the 行 branch, did **not** switch to MERT. One surprise (raw cosines crushed into 0.93–1.0, unreadable) → fixed by mean-centering before retrieval. All recorded with the date.

**Each experiment is small on purpose** — just big enough to settle the unknown, no bigger. Record: the unknown it targeted, the setup, the result (with numbers), the branch taken, and any surprises (which often become new follow-up unknowns). "Should work" is never a substitute for a run.

## Move 5 — Decide

**Ground the verdict in evidence, then commit.** `decision.md` states the chosen approach, the evidence/experiment behind each choice, and — critically — **what was cut and why.**

**Killing options is the job.** A decision that keeps every option alive "just in case" is not a decision. BGM explicitly cut B1 fingerprinting (and parked it as a future precision patch *only if* gold videos turn out to use library originals). Don't hedge — that's the research equivalent of defensive-programming clutter.

**A choice that survives multiple plausible futures is a strong signal it's right.** BGM's strongest argument for B2 wasn't a benchmark — it was that *both* eval futures pointed to it: replayable Gold Cases need a library `audio_url` (fingerprint would mostly return "no match"); statistics-only Gold Cases need just style tags + DSP metrics (don't even need an `audio_url`). One choice, two futures, both satisfied. When you find that, note it.

**Be honest about residual risk and give conservative fallbacks.** For low-confidence pieces, default to safe behavior rather than emitting a confident wrong answer (BGM: low-confidence font/match → leave default, don't ship the wrong one). List what's still un-de-risked so the build phase inherits it with eyes open.

## Move 6 — Self-critique (loop, not a final step)

Periodically — not just at the end — re-read `notes.md` against `question.md`'s success criteria:
- Is a hypothesis now disproven by something gathered since? Mark it `killed`.
- Has confidence shifted? Recalibrate.
- What am I *avoiding* testing? (Often the real biggest risk.)
- Am I answering the question asked, or one that's easier?

**Append dated revisions; never rewrite history.** When a later finding overturns an earlier one, mark the old one superseded and write the new one beside it with a date (the M0/M1/M2 pattern). The trail of how the understanding changed is itself valuable — and it's what lets a resuming agent trust the notes.

**Chaining / self-correction.** For the final write-up: draft the conclusion → critique it against the success criteria (ideally a fresh subagent, or `ask-ai`/`second-opinion` to dodge self-bias) → refine. Each pass is independent, so disagreement surfaces instead of being smoothed over.

---

## Parallel exploration in practice

Gathering and independent de-risk probes are embarrassingly parallel. Two shapes:

- **Plain subagents (Task):** one per source-cluster, sub-question, or candidate approach. Each returns a structured finding; synthesize the results into `notes.md`. Good for a handful of parallel reads.
- **Workflow (under ultracode):** fan out gatherers → dedup/synthesize → **adversarially verify** each surviving hypothesis (several skeptics each trying to *refute* it; keep only those that survive) → hand survivors to the decision. This is the high-assurance shape for a study whose conclusion will drive real engineering work.

Keep synthesis and the final decision in the main loop — they need the whole picture; subagents only see their slice.

## Relationship to other research tooling

- **deep-research skill** — a web-research *report* harness (fan-out search → fetch → verify → cited synthesis). Use it as a *gather-move engine* when the study needs a broad literature sweep; fold its cited report into `sources.md`/`notes.md`. `research` is the larger arc that adds hypotheses, de-risk experiments, a decision, and the handoff to build.
- **advanced-plan** — the downstream. The moment `decision.md` exists and implies building, the work crosses from "which approach" to "build it." Start a plan; its `spec.md` cites the research dir. Resist letting the study quietly become the build — different scope, different file set, different success criteria.

## Anti-patterns

- **Answer-shopping** — searching until you find a source that agrees with a pre-formed answer. The hypothesis tree + cross-checking exists to prevent this.
- **Easy-first de-risking** — polishing the certain parts while the risky assumption sits untested. Invert it.
- **Confidence theater** — writing "high confidence" to sound decisive. Calibrate honestly; the biggest-uncertainty line is the most useful sentence in `notes.md`.
- **The everlasting study** — no success criteria, so it never concludes. Frame stops this; `conclude` ends it.
- **Decision drift** — reopening a settled, evidence-backed call on a hunch. Reopen only on new facts.
