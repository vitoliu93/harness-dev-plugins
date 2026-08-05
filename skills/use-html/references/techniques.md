# Techniques that make the picture work

- **SVG for diagrams, not raster images.** Inline SVG is editable, scalable,
  and themable via CSS. Use `<marker>` for arrowheads, `<g transform>` to group
  + place nodes. (PlantUML and Mermaid emit SVG too — see `engines.md`.)

  **⚠ CSS variables inside SVG pitfall:** `var(--color-*)` works for `fill` and
  `stroke` on direct SVG shapes (`<rect>`, `<circle>`, `<text>`) but **fails
  silently** on `<line>` strokes and inside `<defs>`/`<marker>` elements in many
  browsers (Safari, some Chromium versions). The line or arrowhead simply
  doesn't render — no error, no fallback. **Always use hardcoded hex values**
  for `<line stroke="...">` and `<marker>` / `<path>` fills. Keep CSS variables
  for the surrounding HTML/Tailwind layer only. Define a comment block mapping
  hex → semantic name for maintainability:

  ```
  <!-- Palette: #6a9bcc = sys-a/sky, #d97757 = sys-b/clay,
       #788c5d = sys-c/olive, #c46686 = sys-d/fig -->
  ```

- **CSS Grid for spatial composition.** `grid-template-areas` lets regions be
  placed by meaning (`"hero hero" "panel-a panel-b"`), not by document order.
  Don't centre everything into a narrow reading column — let the canvas breathe.
- **Encode meaning visually.** Color = category. Size = magnitude. Position =
  time or sequence. Line weight = importance. Don't decorate — make every visual
  attribute carry information.
- **One strong focal point.** The reader's eye should land somewhere obvious
  first. Build outward from that anchor, not from an even grid of equal-weight
  blocks.
- **Annotate in place.** Pull-lines from labels to the things they describe, or
  numbered callouts (①②③) tied to the diagram, beat a separate legend the reader
  has to cross-reference.
- **Responsive by default.** The composition has to survive a phone — re-flow
  grids to single column, scale SVG with `viewBox`, never fix pixel widths.
- **Restraint.** Two or three colors from the palette, not all of them. One
  diagram done well, not three half-drawn ones.

## Techniques that still apply

- **Exploit ingestion.** Base the artifact on real data — codebase, git history,
  MCP results — not placeholder lorem. This is the reason to do it here rather
  than in a web UI.
- **Self-contained.** Inline CSS and JS so the file opens standalone in a
  browser, no build step, no network dependencies beyond the CDN scripts
  (Tailwind / Mermaid / ECharts / plantuml-encoder) and plantuml.com for
  PlantUML diagrams.
- **Match house style.** If a design-system reference exists, point at it before
  inventing colors and type.
- **Always-export for interactive artifacts.** Any tool the user manipulates
  must round-trip its state back out as a paste-able artifact.
