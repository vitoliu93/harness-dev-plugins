# De-risk Experiments: <subject>

> Order by **de-risk priority, not easy-first**: the cheapest experiment that punctures the biggest unknown goes first. Known-safe parts run in parallel. Record each result *and which branch it sends you down*.

## Experiment queue (riskiest first)
| # | Targets unknown | Cheapest probe | Predicted "pass" signal |
|---|-----------------|----------------|-------------------------|
| E1 | <the assumption most likely to break the approach> | <smallest test that settles it> | <what result means "go"> |
| E2 (parallel) | <known-safe piece, run alongside> | <…> | <…> |

## Results (dated)

### E1 — <name>  (<YYYY-MM-DD>)
- **Unknown**: <what we didn't know>
- **Setup**: <data / scale / command — small on purpose>
- **Result**: <metric / observation. e.g. "top-5 same-class hit 0.83 vs random 0.34">
- **Branch taken**: ✅ 行 → <continue with X> | ❌ 不行 → <fall back to Y>
- **Surprises**: <anything unexpected; new follow-up unknowns>

### E2 — <name>  (<YYYY-MM-DD>)
- …

## What's still un-de-risked
- <any remaining assumption that decision.md must flag as residual risk>
