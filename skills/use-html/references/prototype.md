# Prototype mode

Plans are read by agents; users approve pictures. Render the planned target as
one clickable HTML file, then hold implementation against it.

## Output

Write `docs/advanced-plans/<date>-<slug>/prototype.html` and commit it with the
plan.

- User-visible work: real layout proportions; labels copied verbatim from the
  source; realistic control ranges; fake data; every touched state reachable by
  clicking (empty/loading/error/selected/disabled).
- Backend/infra: components, data flow, critical-path sequence, and clickable
  nodes exposing concrete contracts.

## Provenance rule

Every section has `data-src="PRD §3.6"` or `data-src="推断"` and renders the two
differently. The header shows `参考真源: <path> · 推断 N 处`. Source silence is
marked as a minimal inference; contradictions are marked `冲突` and show both
versions. The user should be able to scan for guesses instead of proofreading.

## Gates

1. Put reference sources under `docs/refs/<slug>/` and read them end to end
   before rendering. Search hits are not enough.
2. Use `explainer.md` plus its referenced engines/layouts/template to render.
3. After approval, execute uninterrupted. If understanding changes, update the
   prototype and say so; never drift silently.
4. `goal.md` names the prototype as a source of truth; vendor briefs cite its
   path rather than retelling it; acceptance compares the result against it.

The lifecycle is what differs from an explainer: this file is committed,
approved, and load-bearing.
