# Scenario catalog — preset dispatch shapes

Ranked by expected frequency. Gate column: **D**iversity (non-Anthropic eyes —
a subagent structurally can't) · **Q**uota (heavy/long, burns someone else's
tokens) · **I**ndex (Cursor workspace index). Any Q scenario can run
overnight/detached and resume by session id — that's a delivery mode, not a
separate scenario.

Picks name MODELS (roster + carrier chains: ../SKILL.md; powers: models.md);
the carrier is whatever that model's chain says is up.

| # | Scenario | Brief shape | Model pick | Gate |
|---|----------|-------------|------------|------|
| 1 | Repo recon / onboarding map | "map how X flows through this repo → module + call-path digest" | grok-4.5 (cursor `--mode plan` — the index) | I,Q |
| 2 | Bug-report reproduction | paste report; "set up env, minimal failing repro + root-cause note" | grok-4.5 (locates suspects) or deepseek-v4 | Q,I |
| 3 | Independent diff/branch review | "review branch B for correctness/security, ranked findings file:line" | gpt-5.6-sol (precision); grok-4.5 only with a verifier pass | **D**,I |
| 4 | Test-suite authoring (module frozen) | "write + run suite for M, target paths P, leave green" | deepseek-v4 | Q |
| 5 | Research / investigation | "answer Q with cited sources + recommendation" | kimi-k3 (1M ctx digestion) or gpt-5.6-sol | Q |
| 6 | Dependency upgrade / migration pilot | "bump vX→vY, fix build+tests, stop at green; resumable" | deepseek-v4 / grok-4.5 | Q |
| 7 | Docs generation | "write docs for surface X from code, into path P" | deepseek-v4 / composer-2.5 | Q |
| 8 | E2E / integration run | "drive flow F in a real env, report failures + traces" | deepseek-v4 / grok-4.5 | Q |
| 9 | Flaky-test hunt | "run suite N×, bisect flaky ones, report seeds/conditions" | deepseek-v4, detached | Q |
| 10 | Red-team adversarial analysis | "attack surface S: exploits/abuse/edge failures, PoC each" | grok-4.5 (recall) + gpt-5.6-sol verify; kimi-k3 for diversity | **D** |
| 11 | Second-opinion implementation | same spec → TWO models in parallel, diff results | gpt-5.6-sol + kimi-k3 (different families) | **D** |
| 12 | Benchmark run | "perf bench B, N iters, medians + regressions vs baseline" | deepseek-v4, isolated process | Q |

**Diversity core: #3, #10, #11** — these need a foreign model family
(gpt-5.6-sol / grok-4.5 / kimi-k3 / deepseek-v4 all qualify; the anthropic
subagent floor does NOT — falling back to it converts a D dispatch into
more-Claude-eyes, so either wait for a carrier or reframe as /code-review).
Low on foreign quota → cut from the bottom of the list, keep 3/10/11.

**Quota economics (2026-07-31): grok-4.5 is the default Q model** — cursor
Ultra quota is huge and underused; gpt-5.6-sol is the hard-tier escalation on
the same pool. kimi-k3 quota is small: spend only on diversity-core
(#3/10/11), true 1M-ctx digestion, or vision. Fast/light tasks:
composer-2.5 (vision — its edge over deepseek), deepseek-v4 as that tier's
backup. Under observation — revisit as the ledger accumulates.

**Modality check before picking a vendor**: any scenario whose inputs include
images/screenshots (bug repro with UI screenshots, doc generation from
diagrams, E2E visual checks) lands on a vision-capable cell — cursor
composer/grok or kicode k3 (verified 2026-07-22). deepseek (dscode) degrades
gracefully; glm via arkcode dies with API 400. A text-only cell stays
eligible when the brief routes the media file through the media-understanding
script first (Gemini → text; e2e verified via dscode 2026-07-22) — name the
exact script path in the brief. Matrix in `vendor-onboarding.md`.

Consume cheaply: digests and finding lists are read; repros and suites are
run once; diffs are `git diff`-ed. If consuming the result means re-deriving
it, the scenario failed the litmus — shouldn't have been dispatched.
