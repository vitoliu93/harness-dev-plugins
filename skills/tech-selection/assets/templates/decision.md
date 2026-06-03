# Decision / 技术选型: <subject>

> Draft this early (write the "current leaning" + "what we'd cut" even before experiments), finalize at `conclude`. Becomes the downstream advanced-plan's `spec.md`.

**Status**: draft | final   **Decided**: <YYYY-MM-DD>

## One-sentence verdict
<The chosen approach in a single line. e.g. "Demucs separate → CLAP tag + retrieval (drop fingerprinting) → librosa DSP for hard metrics.">

## Recommended approach
<The approach in prose, per sub-question. Why this composition.>

| Sub-question | Chosen | Why |
|--------------|--------|-----|
| SQ1 | <option> | <grounded in evidence / experiment #> |
| SQ2 | <option> | <…> |

## What we cut — and why
- **<rejected option>** — <why killed. Killing options is the job; don't keep "just in case" routes.>
- <…>

## Evidence base
- <decision ← experiment E_ result / source #_>. Confidence: <high/med/low>.
- A choice that **survives multiple plausible futures** noted here: <if applicable>

## Residual risks & fallbacks
- <risk still open> → <conservative fallback / when to revisit>
- **For each low-confidence piece, name the safe default** — what does the system output when confidence is below threshold? (omit the field / leave a placeholder / mark `_unmapped`). Never substitute a wrong value for an unknown one.
  - <sub-problem> → <safe default>

## Handoff
- Build it via **advanced-plan** — new plan's `spec.md` cites `docs/research/<date>-<slug>/`.
- Open questions deferred to build: <…>
