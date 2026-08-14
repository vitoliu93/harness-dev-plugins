# Visual patterns

Each pattern describes the *shape* of the artifact, not its content. Pick one
(or compose two) based on what the information actually is.

**System / architecture explainer.** A primary diagram dominates the canvas;
small annotated cards arranged around it carry detail. Subsystems are
color-coded with a consistent palette. Static is fine if labeling is good —
interactivity isn't the point. Architecture diagrams default to **PlantUML**
(see `engines.md`); hand-roll the SVG only when custom shapes or in-place
annotations are central.

**Option comparison (exploration / brainstorm).** A grid of N option cards laid
out side by side, each with a tiny mockup or sketch and a one-line tradeoff
label. Never stack options vertically — the reader has to compare spatially or
the artifact has failed.

**Process / flow.** Stage nodes (pills or rounded rectangles) connected by
arrows, branching where decisions matter. Edge annotations attach to the
arrows, not to a separate legend.

**Timeline / incident / roadmap.** A horizontal or vertical axis with events
plotted in time. Color bands encode actor or system. Callouts pull out the
moments that matter; the rest stays as low-contrast scaffolding.

**Dashboard / report.** Big headline numbers up top, supporting metrics and
sparklines in a 2- or 3-column grid below. The reader's eye should land on the
hero metric first. Any real data series is an **ECharts** chart, not
hand-drawn SVG bars.

**PR / code explainer.** Annotated diff alongside a small SVG flow of the
affected subsystem, with 2–3 numbered callouts pointing at the lines that
matter. Attach the file to PRs.

**Throwaway editor / tool.** Controls on one side, live visual preview on the
other, **export button** at the bottom. The state has to round-trip back out as
JSON / prompt / diff so the result is paste-able into Claude Code.
