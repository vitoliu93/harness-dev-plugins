# Explainer mode

Markdown is linear. This mode produces an infographic where the picture carries
the idea and text annotates it.

## One rule

Decide the picture before writing HTML: flow, tree, 2×2, timeline, system map,
comparison, or stats panel. Build that shape; do not pour prose into the starter
template.

Use it for architecture, comparisons, processes/state machines, timelines,
dashboards, PR/code explainers, and throwaway interactive tools. Keep Markdown
when the deliverable is linear text that needs hand edits or clean diffs.

## Build

1. Read `patterns.md` and choose the smallest useful layout.
2. Route drawing to the right engine:
   - PlantUML: architecture/UML/C4/ER/state/sequence;
   - ECharts: data charts;
   - Mermaid: gitGraph/mindmap/timeline/journey/quadrant;
   - hand SVG: a custom hero picture with in-place annotations.
   Read `engines.md` for setup and theming.
3. Start from `template.html`, then remove every unused region and replace all
   examples with the real content.
4. Read `techniques.md` before drawing arrows or SVG markers. Use one focal
   point, encode meaning visually, annotate in place, and keep it responsive.

Use real codebase/git/MCP data, never lorem ipsum. Keep the file self-contained
with inline CSS/JS and no build step. Interactive artifacts must export their
state as pasteable JSON, prompt, or diff.

## Deliver

Write the `.html` file and offer `open <file>` on macOS. Do not assume a hosting
or upload path. If the picture remains weak, fall back to prose rather than ship
decorated text; HTML also costs more to generate and produces noisy diffs.
