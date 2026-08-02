# Advisory dispatch — brief, engines, output contract

Ported from the second-opinion agent (folded in 2026-07-28): same act as an
execution dispatch — brief out, report back — but the deliverable is a
judgment, so the acceptance command and the economics floor have nothing to
bite on. What replaces them is the brief discipline below and your own
verification of the verdict's code claims.

## The brief — five sections, zero-context

1. **Framing** — which kind: plan check / bug / design review / done-check.
2. **Inputs** — exact code, config, versions; the minimum repro. Paths, not a
   prose retelling (same rule as execution briefs: your summary carries your
   blind spots). Plan check: the intended approach plus its constraints.
3. **Expected vs actual** — specific and observable. Plan check: the goal and
   the doubts you actually have.
4. **Ruled out** — hypotheses already dead, decisions already settled. Without
   it you pay for advice you have already rejected once.
5. **Length cap** — "under 400 words", etc.

Can't write all five? You don't have a question yet. Sharpen it first — a thin
brief buys a confident guess, and a confident guess is worse than no consult.

## Engines

**Subagent** (fresh context, same family) — spawn with the five-section brief
plus the output contract below. It has Read/Grep: name the paths and let it
ground itself in the code rather than in your account of the code.

**Headless fable** (stronger reasoning):

```bash
ans=$(mktemp -t advice.XXXXXX)
claude -p --model fable --effort high "<brief>" > "$ans"    # long: < brief.txt
```

- Run it from the repo root — the headless session has its own Read/Grep/Bash
  loop, so paths in the brief are explorable and writes stay permission-gated.
  Exactly right for a reviewer.
- `-p` stdout is the final answer text only; no banner noise to filter.
- xhigh can run minutes: `timeout: 600000` or `run_in_background: true`. Never
  kill a run for being slow.
- Never `--bare` (restricts auth to `ANTHROPIC_API_KEY`, breaks OAuth/keychain)
  and never `--dangerously-skip-permissions`.
- This bills the interactive 5h Anthropic quota — it is the one sanctioned use
  of the real `claude` binary (`claude-variants.md`), so spend it on real
  questions, not reflex consults.

**Vendor** (foreign family) — the vendor sheets, unchanged. This is the D gate
of the execution side pointed at a question instead of a task.

## Output contract

400–700 words. The first paragraph is the single thing that matters most.
"Your plan is sound, watch out for X" is a valid and valuable answer — an
advisor that invents objections to justify the consult is worse than none.

```
## Verdict: <proceed / adjust / stop-and-rethink — one sentence>

<guidance concrete enough to act on: files, functions, ordering, the specific
 risk. Prioritized, not a survey.>

**If I'm wrong:** <the empirical signal that falsifies this advice — adapt
 when you hit it instead of following it off a cliff>
**Verification:** <"Confirmed against <file/behavior>" | "Hypothesis only —
 not checked against code">
```

## Consuming it

Verify the code claims yourself, then adopt or reject each point explicitly —
an unread verdict is a dispatch you paid for and threw away. **Two rounds
max**: one ask, plus one counter-argument if the verdict misread something.
Then decide. An advisor you argue with five times is one you are trying to
make agree with you.

## Resident advisor — 长战役的常驻审查人

One-shot consults don't fit a multi-hour/-day campaign (采集战役、无人值守监控、
长 issue 队列): the advisor needs the campaign's history to catch drift. Pattern
proven 2026-07-31 小米采集 (11 rounds; caught a 96% under-collection the worker
had mis-attributed to the platform, a budget-counter bug that would have
false-stopped the run overnight, and two fake-denominator metrics in the
deliverable):

- **Fixed session, resumed** — create once with `claude -p --session-id <uuid>
  --model fable "<开局审查 brief>"`, continue every round with `claude -p -r
  <uuid>`; the advisor keeps history and can compare rounds. `--session-id` on
  an existing session errors — resume (`-r`) is the continuation path.
- **Briefs land on disk, fed via stdin** (`< brief.md`) — long briefs blow the
  argv limit; answers archived next to the campaign data, not lost in scrollback.
- **Sync on milestones, not on the clock** — phase done / anomaly / before any
  irreversible step (spend, delete, publish). Escalate instead of stalling:
  风控、超预算、通道判死 → brief the advisor and keep working the other lanes
  (停摆本身就是成本).
- **Three brief skeletons** — 开局审查 (plan + acceptance criteria, verbatim);
  轮次回执 (facts since last sync + what changed + next irreversible step);
  终局审计 (deliverable + per-criterion PASS/FAIL ask, "他点头才算完成").
- **Two-rounds-max still holds per question** — the resident relationship is
  many questions over one campaign, not re-arguing one verdict eleven times.
- Quote the user's new constraints **verbatim** in the sync brief (逐字引用 +
  冲突点), never paraphrased — the advisor audits against the words, and your
  paraphrase carries your framing bias.
