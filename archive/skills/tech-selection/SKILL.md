---
name: tech-selection
description: >-
  Treat an open question — "which approach/library should we use?", "is this
  feasible?", "how do others solve this?" — as a tracked study that survives
  context resets and cross-agent handoff. Use when the user says "research",
  "调研", "方案调研", "技术选型", "evaluate approaches", "is X feasible", "compare
  X vs Y", or kicks off an investigation where the goal is known but the approach
  is not; also to RESUME: "continue research", "继续调研", "接着调研 <slug>".
  Upstream of advanced-plan: research decides WHICH approach is viable, advanced-plan BUILDS it.
argument-hint: "[new <question> | resume <slug> | conclude <slug>]"
---

# tech-selection

Turn an open question into a tracked study. The point is **not** ceremony — it's that research that lives only in chat is unauditable and unresumable. Here, any agent (or future-you) opens one directory and knows the question, what's been read, which approaches are live, where confidence sits, what's been de-risked, and what was decided + why.

Claude works as two personas at once:
- **Scholar** — gather information, search opinions, verify across multiple sources, synthesize, map the concepts.
- **Architect** — estimate choices, de-risk the riskiest assumption with the cheapest experiment, decide, and design the approach that will be built.

**The arc:** `frame → gather → hypothesize → de-risk → decide → hand off`. research is the phase **before** [advanced-plan](#integration-with-other-skills): it answers *which approach and is it viable*; advanced-plan answers *build it*. Its output `decision.md` becomes the next plan's `spec.md`.

Seven possible files, **lazy by tier** — do not create all seven to pick between two libraries:

| File             | What it is                                                       | When to create                        |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------- |
| `question.md`    | North star — the question, success criteria, scope. Locked.      | always                                |
| `notes.md` ⭐     | **Live source of truth** — hypothesis tree, confidence, findings | always                                |
| `decision.md`    | The verdict — chosen approach, why, what was cut, residual risk  | start as a draft; finalize at conclude |
| `sources.md`     | Annotated, multi-source-verified inventory + reading route       | when external literature/tools matter |
| `landscape.md`   | Option-space survey (方案调研) — pipeline + candidates + risk     | when ≥2 competing approaches           |
| `experiments.md` | De-risk log — biggest unknown first, cheapest probe, outcome     | when an experiment is needed to settle |
| `glossary.md`    | Shared vocabulary + data-flow (术语与流水线)                      | optional — jargon-dense domains        |

**Tiers — match ceremony to the question:**
- **Scoped** (bounded: "which date library?", "is approach Y feasible?"): `question.md` + `notes.md` + `decision.md`. A short gather → decide is enough — skip `landscape.md`/`experiments.md` and the heavier moves unless a real risk surfaces.
- **Study** (open-ended, multi-approach, needs de-risking — e.g. a new feature/algorithm): all applicable. `experiments.md` is the heart — the answer isn't trusted until the riskiest assumption is punctured.

If the question is genuinely trivial (one obvious answer, one doc lookup), just answer it — don't open a study.

## Setup

A study is a directory committed to the repo, so it lands in history beside the code it justifies, as first-class project docs:

```
$ROOT/docs/research/<YYYY-MM-DD>-<slug>/      # $ROOT = git rev-parse --show-toplevel
  question.md  notes.md             # always
  decision.md                       # draft early, final at conclude
  sources.md  landscape.md          # optional — study tier
  experiments.md  glossary.md       # optional
```

- **Default — current branch.** Create the dir on the branch you're on and commit there. No worktree, no branch dance. This matches how most studies actually run: a few sessions, docs in `docs/`, done.
- **Works best in a git repo** (the committed dir is the audit trail + cross-agent channel). Not in one? The files still work — offer `git init` so the study is shareable.
- `<slug>` = 2-4 word kebab-case summary.

### Optional — isolated worktree mode

For a **long-running study, cross-machine work, or parallel agents** that would otherwise collide, run it in a dedicated worktree + branch — the same model as advanced-plan, opt-in:

1. `EnterWorktree name: "research-<date>-<slug>"` → creates `.claude/worktrees/research-<date>-<slug>/` on a new branch of the same name and switches in. Then create files there.
2. One study = one branch = one worktree; slug/branch/worktree share the `<date>-<slug>` stem (greppable by one keyword).
3. Already inside *this study's* worktree → reuse it. Inside a *different* worktree (e.g. an advanced-plan branch) → `EnterWorktree` refuses to nest; either commit the study on that branch or start the research from the main checkout.

> `EnterWorktree`'s base ref follows the repo's `worktree.baseRef` setting (`fresh` = origin/default branch, `head` = current HEAD). Don't override it unless the user asks.

Cross-agent reach then has one model — the branch (same machine → enter the worktree; another machine → push/fetch the branch). The `.lock` protocol (see [Multi-agent](#advanced--multi-agent-on-a-shared-study)) applies only in this mode.

## Templates

Blank templates live in `assets/templates/` (one per file). **Creation = copy, then fill** — never hand-retype the structure:

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TPL=~/.claude/skills/tech-selection/assets/templates
DIR="$ROOT/docs/research/$(date +%F)-<slug>"
mkdir -p "$DIR"
cp "$TPL"/{question,notes,decision}.md "$DIR"/          # core (decision starts as a draft)
cp "$TPL"/{sources,landscape,experiments}.md "$DIR"/    # add for a study
# cp "$TPL"/glossary.md "$DIR"/                          # only if jargon-dense
```

After copying, replace the `<...>` placeholders with real content.

---

## Commands

### `new` — start a study (default action)

Trigger: "research", "调研", "技术选型", or any "which approach / is it feasible" question.

1. **Restate the question back in one or two sentences, decide the tier** (scoped/study), settle the `<slug>`. If the question is fuzzy, sharpen it *with the user before gathering* — a vague question yields a vague answer.
2. **Make the study dir** on the current branch: `mkdir -p $ROOT/docs/research/<date>-<slug>/` and copy the needed templates (see above). (Heavy mode only: `EnterWorktree` first — see Optional above.)
3. Fill `question.md` and **lock it** — success criteria first ("what would a good answer look like?"), then scope/non-goals, then decompose into sub-questions.
4. Run the `explore` command (six moves, next section). Keep `notes.md` live throughout; the Enforcement rules below are what keep the study honest and resumable.

### `explore` — do the research

Trigger: internal — runs after `new`, or directly after `resume`.

Run the **six moves** (next section), driven by `notes.md`. This is the bulk of the work. Commit the study dir as findings land (and after each de-risk experiment) — the committed dir is the resume point.

### `resume <slug>` — pick up a study

Trigger: "continue research", "继续调研", "接着调研 <slug>", or `/tech-selection <kw>` matching an existing study.

1. **Find it:** look for `$ROOT/docs/research/*-<kw>/` on the current branch. (Heavy mode: also `git worktree list | grep -i "$kw"` / `git branch -a --list "*$kw*"`, then enter that worktree.) Nothing matches → treat as a **new** study (explicit `resume/继续` instead reports "no study found" rather than creating).
2. **Recover:** read `question.md` (what + success criteria) → `notes.md` `Current State` + hypothesis tree (where we are, what's live, confidence) → skim `experiments.md` (what's punctured). That's full recovery.
3. If a `.lock` is present (heavy mode) and its lease is valid, coordinate or wait. Claim the next open thread (a thread = one open hypothesis branch or sub-question) and continue.

### `conclude <slug>` — decide and hand off

Trigger: enough is known to choose, or "结论", "下结论", "conclude research".

1. **Finalize `decision.md`** (copy its template first if it was never drafted: `cp "$TPL"/decision.md "$DIR"/`): the recommended approach, the evidence behind it, alternatives rejected + why, residual risks + low-confidence fallbacks.
2. Commit the final study state.
3. **Hand off to build:** if the decision implies implementation, start an [advanced-plan](#integration-with-other-skills) whose `spec.md` cites this `docs/research/<date>-<slug>/` dir. Research ends where building begins — don't let a study mutate into an unbounded build.
4. **Heavy mode only:** leave the worktree when the user asks — `ExitWorktree action: "keep"` to preserve the branch, or `"remove"` once merged. Don't auto-remove — an unmerged branch would be lost.

---

## The research method (six moves)

These map directly onto Anthropic's documented research guidance (clear success criteria · multi-source verification · competing hypotheses + confidence tracking + calibration · self-critique · a persisted hypothesis-tree/notes file · systematic decomposition). Full worked detail — including the `short-video-reverse` BGM example — is in **`references/method.md`**; read it for any study-tier work.

1. **Frame** (`question.md`) — Write the success criteria *before* searching: what makes an answer good (a metric, a constraint satisfied, a question answerable). State non-goals. Decompose the question into independent sub-questions — the most common mistake is treating a pipeline as a single model (BGM reverse isn't "find a BGM model"; it's separate → identify → characterize).
2. **Gather** (`sources.md`) — Collect from multiple angles using `find-docs`, `exa-code`, `WebSearch`, `qmd query`, the codebase, papers. Start with a quick candidate inventory, then **verify across sources — never trust one StackOverflow answer or stale memory; read the actual docs/source.** Annotate each: type, link, maturity, one-line takeaway. Prioritize into tiers with a reading route.
3. **Hypothesize** (`notes.md`, `landscape.md`) — Lay out competing approaches as a **hypothesis tree**, each with an **honest confidence level**. In `landscape.md`, draw the **pipeline decomposition first** (it reveals whether the problem is one model or a multi-stage pipeline), then survey options per stage with maturity (✅ production / ⚠️ weak / ❌ none) and risk. Name the **single biggest uncertainty** — the assumption that, if false, breaks the whole approach.
4. **De-risk** (`experiments.md`) — Order experiments by **de-risk priority, not easy-first**: spend the cheapest experiment that punctures the biggest unknown. Run known-safe parts in parallel. Record each result *and which branch it sends down* (行 → continue; 不行 → fall back to alternative). "Should work" is not de-risked.
5. **Decide** (`decision.md`) — Ground the verdict in evidence, not gut. State the chosen approach, **what was cut and why** (killing options is the job — don't hedge with "just in case" routes), residual risks, and conservative fallbacks for low-confidence pieces (default to a safe output — omit the field / leave a placeholder — never emit a confident wrong value). A choice that **survives multiple plausible futures** is a strong signal it's right.
6. **Self-critique (loop)** — Periodically re-read `notes.md` against the success criteria: is a hypothesis now disproven? Did confidence shift? What am I avoiding testing? Append **dated revisions** (M0/M1/M2 style); never silently rewrite a superseded finding — mark it superseded. Chain: draft conclusion → critique against criteria → refine.

### Parallel exploration (subagent orchestration)

Breadth-first gathering and independent de-risk probes parallelize well. Spawn subagents (one per source-cluster, sub-question, or candidate approach) — each returns a structured finding; synthesize the results into `notes.md`. Under ultracode, a **Workflow** is the right shape: fan out gatherers, then adversarially verify each surviving hypothesis (multiple skeptics trying to *refute* it) before it reaches `decision.md`. Keep the synthesis and the final call in the main loop — they need full context.

> **Don't over-spawn.** For scoped-tier studies, or anything a single context can finish in one pass, work directly — the subagent overhead outweighs the benefit. Fan out only when breadth genuinely exceeds one context.

---

## What each file means (semantics)

- **question.md** — The question + observable success criteria + scope, decomposed into sub-questions, then **locked**. Approach ideas do NOT go here (they drift) — they live in `notes.md`/`landscape.md`. Only post-lock edit: append-only scope changes.
- **notes.md** ⭐ — The **save-slot**. Two parts: a `Current State` cursor (what a fresh agent reads to recover) and the **hypothesis tree** (each branch: claim · confidence · supporting/refuting evidence · status `open`/`confirmed`/`killed`). Append dated findings; this is the transparency record.
- **sources.md** — Annotated inventory: a quick candidate list that graduates into verified tiers (each entry cross-checked against ≥1 other source, maturity-tagged) + a phased reading route (framing docs before deep papers).
- **landscape.md** — The reframe (pipeline decomposition) + the option space per stage with maturity + risk + fit. The map to decide *from*.
- **experiments.md** — De-risk log. Each: the unknown it targets, the cheapest probe, the result, the branch taken, dated. The riskiest assumption gets the first experiment.
- **decision.md** — Drafted early (current leaning + what we'd cut), finalized at `conclude`. The verdict + rationale + rejected alternatives + residual risk. Becomes the downstream plan's `spec.md`. *In practice you'll often merge `landscape.md` + `decision.md` into one `技术选型` doc — the split is for traceability, not mandatory.*
- **glossary.md** — Vocabulary + data-flow diagram so everyone shares one 口径. Optional.

Boundary: `notes.md` = "what I'm thinking and how sure I am"; `decision.md` = "what we settled."

## Enforcement rules (this is what makes it work)

A study that lies is worse than no study.

1. **Confidence is honest and calibrated.** Mark unknowns as unknown. State the biggest thing you're *not* sure of — that's what gets de-risked first. Never write a comment that justifies an unverified assumption.
2. **Every external claim is sourced and cross-checked.** Read the actual docs/source; don't paraphrase memory or one SO post. An unverified "X supports Y" is a hypothesis, not a finding.
3. **No decision without evidence or an experiment.** If a sub-question carries real risk, an experiment must have punctured it. "Should work" ≠ done.
4. **De-risk order = riskiest first, cheapest probe.** Not "simple-and-certain first."
5. **Append dated revisions; never rewrite history.** A superseded finding gets marked superseded, with the new finding and date beside it.
6. **Don't re-litigate a settled call without new evidence.** Once `decision.md` records a choice with rationale, reopen it only when a fact changes — not on a hunch.
7. **Update `notes.md` `Current State`** before context-heavy work, after each thread, and before stopping/handing off. The cursor must reflect reality.
8. **Match ceremony to the question.** Scoped tier exists for a reason — don't bureaucratize a two-library comparison.

## Advanced — multi-agent on a shared study

Only relevant in heavy (worktree) mode with more than one agent on the same working tree. The study branch is the shared object (same model as advanced-plan): take `docs/research/<date>-<slug>/.lock` (`owner`/`since`/`lease`) before editing shared files; claim threads via `notes.md` `Current State` (a thread = one open hypothesis branch / sub-question, by its `H_` label); one writer per file at a time. Parallel independent strands → give each agent its own worktree off the branch.

## Integration with other skills

- **advanced-plan** (downstream) — research decides *which approach + viability*; advanced-plan *builds* it. `decision.md` → the new plan's `spec.md`. Don't merge the two: a study that drifts into building loses its scope.
- **find-docs** — authoritative, up-to-date docs/API references. The default for "what does this tool actually do" during *gather* — satisfies the cross-check rule.
- **exa-code** — code examples + solutions across GitHub/SO/docs. For "how do people actually implement this."
- **WebSearch / WebFetch** — current papers, announcements, version-specific behavior. **qmd query** — the personal knowledge base (prior research, notes).
- **deep-research** — a separate web-research *report* skill (fan-out search → verify → cited synthesis). When a study needs a broad literature sweep, it can do the heavy gathering; fold its cited report into `sources.md`/`notes.md`. `research` is the larger arc around it (hypotheses → de-risk → decide → build).
- **handoff** — point-in-time context dump; for a tracked study, keep `notes.md` current and let a handoff point at `docs/research/<date>-<slug>/`.
- **self-learn** — after concluding, distill durable technical lessons from the study into personal notes. (Use **cc-reflection** separately if you also want to review the agent×human collaboration quality of the research sessions — that's its purpose, not research-insight distillation.)

## Additional resources

- **`references/method.md`** — deep dive on the six moves: hypothesis-tree format, confidence calibration, the source-verification checklist, de-risk heuristics, and the full `short-video-reverse` BGM worked example (B1 vs B2 → de-risk → decide).
