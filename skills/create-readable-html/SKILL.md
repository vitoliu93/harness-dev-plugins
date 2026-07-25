---
name: create-readable-html
description: >-
  Produce a single self-contained HTML file as a visual explainer — architecture,
  comparison, flow, dashboard 该被一眼看懂时("可视化"、"画个图")。
argument-hint: [what the artifact should show]
---

# Visual explainer, not restyled prose

Markdown and most styled-text HTML are linear — the same shape regardless of the
content. This skill produces an *infographic*: the picture comes first, the text
annotates the picture. A 500-word post and one well-drawn annotated diagram carry
the same idea; the diagram is what the reader remembers.

## The one rule

Before writing any HTML, decide **what the picture is** — a flow? a tree? a 2×2?
a timeline? a system map? a side-by-side comparison? a stats panel? Build that
shape; reach for prose only after the picture is settled.

Do **not** start from the template's structure and pour text into it. Start from
the composition that makes this specific information legible at a glance, then
strip the template down to that shape.

## When to produce one

Default to a visual HTML artifact for: a system / architecture explainer · a
comparison of options or tradeoffs · a process, flow, state machine or decision
tree · a timeline, roadmap or incident reconstruction · a dashboard, stats panel
or before/after · a PR / code explainer · a throwaway interactive tool.

Keep Markdown when the content is genuinely linear text needing hand-edits or
clean version-control diffs (HTML diffs are noisy — a real tradeoff).

## Build it

1. **Pick the shape.** `references/patterns.md` — the seven layouts, what
   dominates the canvas in each, and how each one fails. Read it before
   composing.
2. **Route the drawing to an engine.** Don't hand-roll what an engine draws well:

   | Content | First choice |
   |---|---|
   | Architecture & UML — component, deployment, sequence, class, ER, state, C4 | **PlantUML** |
   | Data charts — bar, line, pie, scatter, radar, heatmap, sankey, candlestick | **ECharts** |
   | Sketches Mermaid owns — gitGraph, mindmap, timeline, journey, quadrant | **Mermaid** |
   | Hero picture with custom shapes, pixel-perfect layout, in-place annotations | Hand-rolled SVG |

   Mixed is often best. Setup snippets, theming and caveats for all three, plus
   the starter template's Tailwind v4 gotchas: `references/engines.md`.
3. **Start from `references/template.html`** — CSS Grid canvas, hero SVG region,
   colour-coded card grid, stats band, Tailwind v4 + Mermaid/ECharts/PlantUML
   pre-loaded. It is a starting point, **not** the output: strip every region
   this artifact doesn't need, replace the example diagram with the real picture,
   swap the `@theme` palette for the project's design system when one exists.
4. **Compose it well.** `references/techniques.md` — SVG craft (including the
   silent `var(--color-*)` failure on `<line>` and `<marker>`: **read this before
   drawing any arrow**), grid composition, encoding meaning visually, one focal
   point, in-place annotation, responsiveness, restraint.

Non-negotiables: base it on **real** data (codebase, git history, MCP results),
never placeholder lorem — that's the reason to build it here instead of in a web
UI; keep it self-contained (inline CSS/JS, no build step); and any interactive
artifact must **export** its state back out as paste-able JSON / prompt / diff.

## Delivering it

Write the `.html` file, then offer to open it (`open <file>` on macOS). For a
shareable link, the user uploads to S3 — don't assume an upload path exists.

## Tradeoffs (state them, don't hide them)

Generation takes ~2–4× longer than Markdown · ugly visual HTML is worse than
ugly text HTML, so if the picture isn't working fall back to prose rather than
ship a half-drawn infographic · HTML diffs are noisy, poor for anything under
heavy version control.
