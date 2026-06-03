---
name: html-doc
description: >-
  Produce a single self-contained HTML file as a visual explainer —
  infographic-style with diagrams and spatial layout, not restyled prose. Use
  when output should be grasped at a glance: architecture, comparisons, flows,
  timelines, dashboards, PR/code visualizations, quick interactive tools. Trigger
  on "make an HTML file", "visualize this", "diagram this", "explain this",
  "review this PR".
argument-hint: [what the artifact should show]
---

# Visual explainer, not restyled prose

Markdown and most styled-text HTML are linear: a stack of headers, paragraphs,
maybe a bulleted list. They produce the same shape regardless of the content.
This skill produces something different — an *infographic*. The picture comes
first; the text annotates the picture. Spatial layout, color, iconography, and
SVG diagrams carry the meaning that paragraphs would otherwise have to spell
out.

A 500-word blog post and one well-drawn annotated diagram can convey the same
idea. The diagram is what the reader will actually remember.

## The one rule

Before writing any HTML, decide **what the picture is**. Sketch it mentally —
is it a flow? a tree? a 2×2? a timeline? a system map? a side-by-side
comparison? a stats panel? Build that shape. Reach for prose only after the
picture is settled.

Do **not** start from the template's structure and pour text into it. Start
from the composition that makes this specific information legible at a glance,
then strip the template down to that shape.

## When to produce a visual HTML artifact

Default to a visual HTML artifact when the output is:

- A system / architecture explainer — the diagram *is* the explanation
- A comparison of options, designs, or tradeoffs — grid or side-by-side
- A process, flow, state machine, or decision tree
- A timeline, roadmap, or incident reconstruction
- A dashboard, stats panel, or before/after comparison
- A PR or code explainer — annotated diff + flow of the affected subsystem
- A throwaway interactive tool — controls + live preview + export

Keep Markdown when the content is genuinely linear text needing hand-edits or
clean version-control diffs (HTML diffs are noisy — a real tradeoff).

## Visual patterns

Each pattern below describes the *shape* of the artifact, not its content.
Pick one (or compose two) based on what the information actually is.

**System / architecture explainer.** A primary SVG diagram dominates the
canvas; small annotated cards arranged around it carry detail. Subsystems are
color-coded with a consistent palette. Static is fine if labeling is good —
interactivity isn't the point.

**Option comparison (exploration / brainstorm).** A grid of N option cards
laid out side by side, each with a tiny mockup or sketch and a one-line
tradeoff label. Never stack options vertically — the reader has to compare
spatially or the artifact has failed.

**Process / flow.** Stage nodes (pills or rounded rectangles) connected by
arrows, branching where decisions matter. Edge annotations attach to the
arrows, not to a separate legend.

**Timeline / incident / roadmap.** A horizontal or vertical axis with events
plotted in time. Color bands encode actor or system. Callouts pull out the
moments that matter; the rest stays as low-contrast scaffolding.

**Dashboard / report.** Big headline numbers up top, supporting metrics and
sparklines in a 2- or 3-column grid below. The reader's eye should land on the
hero metric first.

**PR / code explainer.** Annotated diff alongside a small SVG flow of the
affected subsystem, with 2–3 numbered callouts pointing at the lines that
matter. Beats GitHub's default diff view; attach the file to PRs.

**Throwaway editor / tool.** Controls on one side, live visual preview on the
other, **export button** at the bottom. The state has to round-trip back out
as JSON / prompt / diff so the result is paste-able into Claude Code.

## Techniques that make the picture work

- **SVG for diagrams, not raster images.** Inline SVG is editable, scalable,
  and themable via CSS. Use `<marker>` for arrowheads, `<g transform>` to group
  + place nodes. (Mermaid emits SVG too — see below.)
  **⚠ CSS variables inside SVG pitfall:** `var(--color-*)` works for `fill`
  and `stroke` on direct SVG shapes (`<rect>`, `<circle>`, `<text>`) but
  **fails silently** on `<line>` strokes and inside `<defs>`/`<marker>`
  elements in many browsers (Safari, some Chromium versions). The line or
  arrowhead simply doesn't render — no error, no fallback. **Always use
  hardcoded hex values** for `<line stroke="...">` and `<marker>` / `<path>`
  fills. Keep CSS variables for the surrounding HTML/Tailwind layer only.
  Define a comment block mapping hex → semantic name for maintainability:
  ```
  <!-- Palette: #6a9bcc = sys-a/sky, #d97757 = sys-b/clay,
       #788c5d = sys-c/olive, #c46686 = sys-d/fig -->
  ```
- **CSS Grid for spatial composition.** `grid-template-areas` lets regions be
  placed by meaning (`"hero hero" "panel-a panel-b"`), not by document order.
  Don't centre everything into a narrow reading column — let the canvas
  breathe.
- **Encode meaning visually.** Color = category. Size = magnitude. Position =
  time or sequence. Line weight = importance. Don't decorate — make every
  visual attribute carry information.
- **One strong focal point.** The reader's eye should land somewhere obvious
  first. Build outward from that anchor, not from an even grid of equal-weight
  blocks.
- **Annotate in place.** Pull-lines from labels to the things they describe,
  or numbered callouts (①②③) tied to the diagram, beat a separate legend the
  reader has to cross-reference.
- **Responsive by default.** The composition has to survive a phone — re-flow
  grids to single column, scale SVG with `viewBox`, never fix pixel widths.
- **Restraint.** Two or three colors from the palette, not all of them. One
  diagram done well, not three half-drawn ones.

## Techniques that still apply

- **Exploit ingestion.** Base the artifact on real data — codebase, git
  history, MCP results — not placeholder lorem. This is the reason to do it
  here rather than in a web UI.
- **Self-contained.** Inline CSS and JS so the file opens standalone in a
  browser, no build step, no network dependencies beyond the Tailwind CDN.
- **Match house style.** If a design-system reference exists, point at it
  before inventing colors and type.
- **Always-export for interactive artifacts.** Any tool the user manipulates
  must round-trip its state back out as a paste-able artifact.

## Mermaid for standard diagram types

The starter template pre-loads Mermaid v11 — reach for it when the picture
fits a known diagram type. Mermaid is fast to write, the text is the source
of truth for later edits, and the output is themeable SVG. The cost: less
control over layout and visual emphasis than hand-rolled SVG.

**Use Mermaid for:** flowcharts (`flowchart` / `graph`), sequence diagrams
(`sequenceDiagram`), state machines (`stateDiagram-v2`), class & ER diagrams
(`classDiagram`, `erDiagram`), Gantt and timelines (`gantt`, `timeline`),
mind maps (`mindmap`), git graphs (`gitGraph`), user journeys (`journey`),
2×2 quadrants (`quadrantChart`), block diagrams (`block-beta`).

**Use hand-rolled SVG for:** the headline picture when its shape doesn't
match a standard type, when pixel-perfect layout matters, when custom shapes
or annotations are central, or when the diagram must precisely match the
house palette in ways Mermaid's themer can't reach.

A mixed approach is often best — hand-SVG for the hero diagram (full
control), Mermaid for secondary diagrams (sequence flow, state machine,
mindmap of options) where the standard form is enough.

Any `<pre class="mermaid">` block auto-renders on page load:

    <pre class="mermaid">
    sequenceDiagram
      participant P as Producer
      participant Q as Queue
      participant C as Consumer
      P->>Q: emit event
      Q->>C: deliver (at-least-once)
      C-->>Q: ack
    </pre>

**Theme integration.** The template initializes Mermaid with `theme: 'base'`
and `themeVariables` mapped to the page's `--color-sys-*` palette so diagrams
look native to the artifact. Swap the variables when re-skinning.

**Caveats.** Mermaid loads from a CDN — works locally over `file://` and is
cached after first fetch, but needs network on first open (same as the
Tailwind dependency). Switching system theme after page load won't re-render
already-rendered diagrams without a reload.

## Starter template

`references/template.html` is a graphic-first starting point: a CSS Grid
canvas with a hero SVG diagram region, a colour-coded card grid, and a stats
band. It uses Tailwind CSS v4 via the browser build with an `@theme` token
block (Anthropic official palette — clay primary `#d97757` on cream `#faf9f5`,
with sky / olive / fig functional accents), and pre-loads Mermaid v11 themed
to match. Palette source: `anthropics/skills/brand-guidelines`. Clay accent
is restricted to interactive states (links, primary buttons) and at most one
hero element per artifact — it's a signal, not a decoration.

Light-only by design: most visual artifacts get read once or shared as a
link, and the dual-mode CSS adds noise without much payoff. Add a dark mode
block back in if the artifact really needs it.

Tailwind v4 specifics that bite if you guess instead of follow:

- Load `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` — **not** the v3
  `cdn.tailwindcss.com`.
- v4 has **no JS config object**. Configure inside
  `<style type="text/tailwindcss">` with `@theme { --color-x: …; }`; those
  tokens auto-generate utilities (`text-x`, `bg-x`, `stroke-x`).

The template is a starting point, **not** the output — strip every region the
artifact doesn't need, replace the example diagram with the actual picture
this artifact is built around, and replace the `@theme` palette with the
project's design-system values when one is available.

## Delivering it

Write the `.html` file, then offer to open it (`open <file>` on macOS). For a
shareable link, the user uploads to S3 — don't assume an upload path exists.

## Tradeoffs (state them, don't hide them)

- Generation takes ~2–4× longer than Markdown.
- Ugly visual HTML is worse than ugly text HTML — invest in the composition,
  don't ship a half-drawn diagram. If the picture isn't working, fall back to
  prose rather than ship a bad infographic.
- HTML diffs are noisy — poor for things under heavy version control.
