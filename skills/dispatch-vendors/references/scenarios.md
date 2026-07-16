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
| 4 | Test-suite authoring (module frozen) | "write + run suite for M, target paths P, leave green" | dscode / opencode | Q |
| 5 | Research / investigation | "answer Q with cited sources + recommendation" | cursor-agent or claude -p | Q |
| 6 | Dependency upgrade / migration pilot | "bump vX→vY, fix build+tests, stop at green; resumable" | dscode / opencode | Q |
| 7 | Docs generation | "write docs for surface X from code, into path P" | dscode / composer-2.5 | Q |
| 8 | E2E / integration run | "drive flow F in a real env, report failures + traces" | dscode / opencode | Q |
| 9 | Flaky-test hunt | "run suite N×, bisect flaky ones, report seeds/conditions" | dscode, detached | Q |
| 10 | Red-team adversarial analysis | "attack surface S: exploits/abuse/edge failures, PoC each" | opencode (kimi) or cursor grok | **D** |
| 11 | Second-opinion implementation | same spec → TWO vendors in parallel, diff results | opencode + cursor (different families) | **D** |
| 12 | Benchmark run | "perf bench B, N iters, medians + regressions vs baseline" | claude -p / dscode isolated process | Q |

**Diversity core: #3, #10, #11** — these need a foreign model family to
justify themselves (dscode/arkcode don't count as diverse for #3/10/11 when
the author model is also Claude-shaped output; prefer kimi/glm/grok/gpt).
Low on foreign quota → cut from the bottom of the list, keep 3/10/11.

Consume cheaply: digests and finding lists are read; repros and suites are
run once; diffs are `git diff`-ed. If consuming the result means re-deriving
it, the scenario failed the litmus — shouldn't have been dispatched.
