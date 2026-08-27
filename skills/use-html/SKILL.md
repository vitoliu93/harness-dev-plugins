---
name: use-html
description: >-
  Build one self-contained HTML explainer or clickable pre-build prototype.
  Use for visual explainers, infographics, or approval prototypes before UI or PRD work.
metadata:
  kind: atom
---

# use-html

One file, inline CSS/JS, no build step. Everything the page needs is inside it —
no CDN, no web fonts, no external images. Offline it still renders.

Decide the picture first (flow, tree, timeline, 2×2, system map, stats panel),
then write the HTML. If the picture stays weak, write prose instead; decorated
text is worse than plain text.

Use real data from the codebase, git, or the source doc. Never lorem ipsum.

Write the file, then reply with its path and `open <file>`. Do not paste HTML
into chat. Do not assume a place to host or upload it.

## Prototype mode

When the point is user approval before building, write
`docs/advanced-plans/<date>-<slug>/prototype.html` and commit it with the plan.
Mark every section with `data-src` — the real source, or `推断` when you guessed —
so the user can spot guesses instead of proofreading. Every state the work touches
is reachable by clicking. After approval, build against it; if understanding
changes, update the file and say so.
