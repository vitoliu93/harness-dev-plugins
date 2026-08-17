# Scenario catalog — preset dispatch shapes

Ranked by expected frequency. Gate column: **D**iversity (non-Anthropic eyes) · **Q**uota (heavy/long) · **I**ndex (Cursor workspace index). Any Q scenario can run overnight/detached and resume by session id.

Picks are ROLES (model-use-guide.md); resolve each to a concrete model from the
vendor manifest (schema: vendor-manifest.schema.md); carrier = the cell holding
that model. Effort is chosen per task, never below the manifest floor.

| # | Scenario | Brief shape | Role | Effort | Gate |
|---|----------|-------------|------|--------|------|
| 1 | Repo recon / onboarding map | "map how X flows through this repo → module + call-path digest" | `executor` on the index carrier (plan mode) | floor | I,Q |
| 2 | Bug-report reproduction | paste report; "set up env, minimal failing repro + root-cause note" | `executor` | mid | Q,I |
| 3 | Independent diff/branch review | "review branch B for correctness/security, ranked findings file:line" | `advisor` | high | **D**,I |
| 4 | Test-suite authoring (module frozen) | "write + run suite for M, target paths P, leave green" | `executor` | floor | Q |
| 5 | Research / investigation | "answer Q with cited sources + recommendation" | `executor` (1M-ctx model) | mid | Q |
| 6 | Dependency upgrade / migration pilot | "bump vX→vY, fix build+tests, stop at green; resumable" | `executor` | mid | Q |
| 7 | Docs generation | "write docs for surface X from code, into path P" | `executor` | floor | Q |
| 8 | E2E / integration run | "drive flow F in a real env, report failures + traces" | `executor` | mid | Q |
| 9 | Flaky-test hunt | "run suite N×, bisect flaky ones, report seeds/conditions" | `executor`, detached | mid | Q |
| 10 | Red-team adversarial analysis | "attack surface S: exploits/abuse/edge failures, PoC each" | `executor` sweep + `advisor` verify | high on the verify | **D** |
| 11 | Second-opinion implementation | same spec → TWO executors of different families, diff results | `executor` ×2 | mid | **D** |
| 12 | Benchmark run | "perf bench B, N iters, medians + regressions vs baseline" | `executor`, isolated process | floor | Q |

**Diversity core: #3, #10, #11** — need a model whose `family` is not
anthropic (any manifest cell qualifies; anthropic subagent floor does NOT).
Low foreign quota → cut from bottom, keep 3/10/11.

**Default routing**: `executor` on the manifest `default_pool` for the Q gate;
`advisor` for anything that ends in a verdict. Scarce pools →
diversity-core (#3/10/11), true 1M-ctx digestion, or vision.

**Check modality before routing:**
- Route images and screenshots to `vision`-capable cells (manifest
  `capabilities`) with a model whose note does not say text-only.
- Text-only models: never send images directly — run the media-understanding
  script first or pick a vision model.

Consume cheaply: digests and finding lists are read; repros and suites run once; diffs are `git diff`-ed. If consuming the result means re-deriving it, the scenario failed the litmus.
