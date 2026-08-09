# Scenario catalog — preset dispatch shapes

Ranked by expected frequency. Gate column: **D**iversity (non-Anthropic eyes) · **Q**uota (heavy/long) · **I**ndex (Cursor workspace index). Any Q scenario can run overnight/detached and resume by session id.

Picks are CAPABILITIES (model-use-guide.md); resolve each to a concrete slot
from the vendor manifest (schema: vendor-manifest.schema.md); carrier = the
cell holding that slot.

| # | Scenario | Brief shape | Capability pick | Gate |
|---|----------|-------------|------------|------|
| 1 | Repo recon / onboarding map | "map how X flows through this repo → module + call-path digest" | `default_q` (plan mode — the index) | I,Q |
| 2 | Bug-report reproduction | paste report; "set up env, minimal failing repro + root-cause note" | `default_q` (locates suspects) or `bulk` | Q,I |
| 3 | Independent diff/branch review | "review branch B for correctness/security, ranked findings file:line" | `hard` (precision); `default_q` only with a verifier pass | **D**,I |
| 4 | Test-suite authoring (module frozen) | "write + run suite for M, target paths P, leave green" | `bulk` | Q |
| 5 | Research / investigation | "answer Q with cited sources + recommendation" | `long_context` (1M ctx digestion) or `hard` | Q |
| 6 | Dependency upgrade / migration pilot | "bump vX→vY, fix build+tests, stop at green; resumable" | `bulk` / `default_q` | Q |
| 7 | Docs generation | "write docs for surface X from code, into path P" | `bulk` / `fast_light` | Q |
| 8 | E2E / integration run | "drive flow F in a real env, report failures + traces" | `bulk` / `default_q` | Q |
| 9 | Flaky-test hunt | "run suite N×, bisect flaky ones, report seeds/conditions" | `bulk`, detached | Q |
| 10 | Red-team adversarial analysis | "attack surface S: exploits/abuse/edge failures, PoC each" | `default_q` (recall) + `hard` verify; `long_context` for diversity | **D** |
| 11 | Second-opinion implementation | same spec → TWO slots in parallel, diff results | `hard` + `long_context` (different families) | **D** |
| 12 | Benchmark run | "perf bench B, N iters, medians + regressions vs baseline" | `bulk`, isolated process | Q |

**Diversity core: #3, #10, #11** — need a slot whose `family` is not
anthropic (any manifest cell qualifies; anthropic subagent floor does NOT).
Low foreign quota → cut from bottom, keep 3/10/11.

**Default routing**: `default_q` for Q gate on the manifest `default_pool`;
`hard` for hard-tier escalation on the same pool. Scarce pools →
diversity-core (#3/10/11), true 1M-ctx digestion, or vision. Fast/light:
`fast_light` (vision edge over `bulk`), `bulk` as backup.

**Check modality before routing:**
- Route images and screenshots to `vision`-capable slots (manifest
  `capabilities`).
- Text-only slots: never send images directly — run the media-understanding
  script first or pick a vision slot.
- Read the manifest for which slots are vision-capable.

Consume cheaply: digests and finding lists are read; repros and suites run once; diffs are `git diff`-ed. If consuming the result means re-deriving it, the scenario failed the litmus.
