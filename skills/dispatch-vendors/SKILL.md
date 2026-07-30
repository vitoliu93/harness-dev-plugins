---
name: dispatch-vendors
description: >-
  Delegate to a separate AI process — either a whole self-contained task (repo
  recon/影响面勘察, bug repro, 红队/独立 review, test authoring, E2E, docs,
  research, dependency migration) sent to a vendor agent CLI, or a judgment
  call (第二意见 / 校审 / advisor / ultra review / plan check / 卡住了 /
  done-check) sent to a fresh, stronger, or foreign pair of eyes. Load
  PROACTIVELY on non-trivial multi-step work: before substantive edits, when
  stuck (2+ dead hypotheses), and before declaring done.
argument-hint: "[vendor + task | task brief | 第二意见 brief]"
---

# dispatch-vendors

Two things go to a separate AI process. **Execution** — a whole self-contained
task on someone else's quota, back as a diff you verify with a command.
**Advisory** — another model's judgment, back as a verdict nothing can run.
Same launch mechanics, separate gates: the execution gate below would reject
every second opinion ever asked.

A vendor is a full standalone agent subprocess — complete tool ecosystem, real
autonomy, session-resumable, and above all **someone else's quota**. The unit
of execution dispatch is a WHOLE independent task with a clean boundary —
never a slice of the module being built here; that's subagent/Workflow
territory.

**Once the gate says yes → `references/protocol.md`** (brief · probe · launch ·
verify · ledger · quota-limited recovery). Scenario catalog with brief shapes
and picks: `scenarios.md`. New carrier: `vendor-onboarding.md`.

## Model roster — dispatch a MODEL, not a CLI

Pick the model for the task; the CLI is just the carrier. Each model has a
fallback carrier chain, and **every chain floors on an Anthropic subagent**
(Agent tool — no vendor process). Powers/weaknesses + routing verdicts:
`references/models.md`. Carrier mechanics: `cursor-agent.md` · `kimi.md`
(kimi-code) · `claude-variants.md` (dscode/arkcode).

| Model | Route here for | Carrier chain |
|---|---|---|
| gpt-5.6-sol | hard tier: day-long unattended runs, precision review; weak UI taste | cursor-agent `gpt-5.6-sol-high\|-xhigh` → subagent |
| grok-4.5 | default Q workhorse: cheap high-volume repo work; review needs a verifier | cursor-agent `cursor-grok-4.5-high` → grok CLI (未爬梯) → subagent |
| composer-2.5 | fast/light tier: cheap edits, vision (sonnet 档) | cursor-agent `composer-2.5` → subagent |
| kimi-k3 | 1M-ctx digestion, vision, frontend; verify facts, quota small | kimi-code → cursor-agent `kimi-k3-high` → subagent |
| deepseek-v4 | bulk codegen / tests, cheap; text-only | dscode → arkcode (sonnet/haiku slots) → subagent |
| anthropic family | needs this session's ecosystem, or all carriers down | subagent — the floor of every chain |

**Image-bearing tasks** need a vision-capable model (composer-2.5 / kimi-k3
verified; grok-4.5 per docs) or the media-understanding fallback in the brief
(`vendor-onboarding.md` matrix). Quota economics 2026-07-31: cursor Ultra is
the big pool → grok-4.5 default, gpt-5.6-sol the hard tier; kimi-k3 quota
small → diversity-core / true-1M / vision only.

## Advisory dispatch — 第二意见 / 校审 / plan check

**Three moments, proactively**: before substantive work (after orientation
reads); when stuck (2+ hypotheses dead); before declaring done.

**Gate: the value is eyes you don't have** — fresh context (you carry the
problem's framing bias), stronger reasoning, or a foreign model family. None
of the three and you are asking yourself again. The execution floor and the
acceptance veto do NOT apply: a verdict is small by nature and nothing about
it is runnable.

| You lack | Target — cheapest source of those eyes |
|---|---|
| fresh context | a subagent (Agent tool) — no process; it Reads the brief's paths itself |
| stronger reasoning | `claude -p --model fable --effort high` (verified live 2026-07-28) |
| a foreign family | the vendor sheets — execution scenarios #3/#10 |

Five-section brief, engine flags, output contract: `references/advisory.md`.
**Advice is a hypothesis until you check it** — a verdict naming a code path
gets Read before it gets acted on. Ledger as `why:advice`.

## Execution gate — dispatch only if at least ONE pays

- **D**iversity: the value IS a non-Anthropic model's eyes — independent
  review, red-team, second-opinion implementation. A subagent structurally
  cannot provide this.
- **Q**uota: heavy/long unattended work (test suite, migration pilot, E2E,
  flaky hunt, benchmark, overnight run) that would eat the 5h window.
- **I**ndex: cursor-agent's workspace index beats cold grep — repo recon, bug
  localization. `--mode plan` for these (its report-never-lands trap:
  protocol.md §2).

**Q has a floor — an economics floor, not a ban.** The vendor must plausibly
run **≥20 min** or produce **≥300 lines**. Below that, writing the brief +
verifying the result costs more than the generation it saves (measured: a batch
of 5–8 minute UI-component dispatches was net-negative) → inline or subagent.
**The floor yields to a standing observation directive** — when the user has
asked to keep observing collaboration, under-floor dispatch is correct and the
ledger row says `why:obs`, not `why:econ` (why that field exists:
protocol.md §4). Never cite "token 没省下来" as a reason to stop dispatching.

**A — acceptance-decidable, a veto (not a reason to dispatch).** Dispatch only
if "did it work" is answerable by a command. When success is judged by *does it
look right* (visual fidelity, layout, wording, feel), the vendor gets only the
machine-checkable subset (data contracts, pure functions, state machines); the
look-and-feel part stays inline. Legitimate middle path: dispatch a
**spec-extraction** run first (design source → verbatim spec table), you approve
the spec, and only then dispatch implementation against it.

Plus the boundary litmus, all four: brief fits in one prompt · zero mid-task
interaction · verifying the result is much cheaper than re-deriving it **and
the verification is not your eyes** · the brief is shorter than the code you'd
write doing it yourself.

## Don't dispatch — route elsewhere

- Result blocks your very next step → it's the main line, do it inline.
- Needs this session's accumulated context (brief would paste >~200 lines of
  prior decisions) → subagent.
- More-Claude-eyes on a diff → `/code-review`; a judgment rather than a diff →
  advisory dispatch above; web research fan-out → deep-research; deterministic
  multi-agent orchestration → Workflow. Vendor execution wins only on D/Q/I.
- User wants to watch or steer → keep it inline (or they bare-open the CLI).
