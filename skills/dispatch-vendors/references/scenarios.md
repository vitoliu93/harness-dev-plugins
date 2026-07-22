# Scenario catalog — preset dispatch shapes

Ranked by expected frequency. Gate column: **D**iversity (non-Anthropic eyes —
a subagent structurally can't) · **Q**uota (heavy/long, burns someone else's
tokens) · **I**ndex (Cursor workspace index). Any Q scenario can run
overnight/detached and resume by session id — that's a delivery mode, not a
separate scenario.

| # | Scenario | Brief shape | Vendor pick | Gate |
|---|----------|-------------|-------------|------|
| 1 | Repo recon / onboarding map | "map how X flows through this repo → module + call-path digest" | `cursor-agent --mode plan` | I,Q |
| 2 | Bug-report reproduction | paste report; "set up env, minimal failing repro + root-cause note" | cursor-agent (locates suspects) or dscode | Q,I |
| 3 | Independent diff/branch review | "review branch B for correctness/security, ranked findings file:line" | `cursor-agent --mode plan` + gpt-5.5/grok | **D**,I |
| 4 | Test-suite authoring (module frozen) | "write + run suite for M, target paths P, leave green" | dscode / kicode | Q |
| 5 | Research / investigation | "answer Q with cited sources + recommendation" | cursor-agent or kicode (k3 1M ctx) | Q |
| 6 | Dependency upgrade / migration pilot | "bump vX→vY, fix build+tests, stop at green; resumable" | dscode / arkcode | Q |
| 7 | Docs generation | "write docs for surface X from code, into path P" | dscode / composer-2.5 | Q |
| 8 | E2E / integration run | "drive flow F in a real env, report failures + traces" | dscode / kicode | Q |
| 9 | Flaky-test hunt | "run suite N×, bisect flaky ones, report seeds/conditions" | dscode, detached | Q |
| 10 | Red-team adversarial analysis | "attack surface S: exploits/abuse/edge failures, PoC each" | kicode (k3) or cursor grok | **D** |
| 11 | Second-opinion implementation | same spec → TWO vendors in parallel, diff results | kicode + cursor grok (different families) | **D** |
| 12 | Benchmark run | "perf bench B, N iters, medians + regressions vs baseline" | dscode / kicode isolated process | Q |

**Diversity core: #3, #10, #11** — these need a foreign model family to
justify themselves (dscode/arkcode don't count as diverse for #3/10/11 when
the author model is also Claude-shaped output; prefer kicode (k3 family) /
glm (arkcode) / grok / gpt).
Low on foreign quota → cut from the bottom of the list, keep 3/10/11.

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
