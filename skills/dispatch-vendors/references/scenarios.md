# Scenario catalog — preset dispatch shapes

Ranked by expected frequency. Gate column: **D**iversity (non-Anthropic eyes) · **Q**uota (heavy/long) · **I**ndex (Cursor workspace index). Any Q scenario can run overnight/detached and resume by session id.

Picks name MODELS (roster + carrier chains: ../SKILL.md; powers: models.md); carrier = whatever that model's chain says is up.

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

**Diversity core: #3, #10, #11** — need foreign model family (gpt-5.6-sol / grok-4.5 / kimi-k3 / deepseek-v4 qualify; anthropic subagent floor does NOT). Low foreign quota → cut from bottom, keep 3/10/11.

**Default routing**: grok-4.5 for default Q on cursor Ultra pool; gpt-5.6-sol for hard-tier escalation on same pool. kimi-k3 quota small — diversity-core (#3/10/11), true 1M-ctx digestion, or vision. Fast/light: composer-2.5 (vision edge over deepseek), deepseek-v4 as backup.

**Check modality before routing:**
- Route images and screenshots to vision-capable cells: cursor composer/grok or kicode k3.
- Treat deepseek through dscode as graceful degradation; do not send images directly to glm through arkcode.
- Keep text-only cells eligible by routing media through the exact media-understanding script path first.
- Read the full matrix in `vendor-onboarding.md`.

Consume cheaply: digests and finding lists are read; repros and suites run once; diffs are `git diff`-ed. If consuming the result means re-deriving it, the scenario failed the litmus.
