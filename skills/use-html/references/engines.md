# Diagram & chart engines, and the starter template

Route by what the picture is; don't hand-roll what an engine draws well. A mixed
approach is often best — PlantUML for the architecture hero, ECharts for the
stats band, hand-SVG when the shape is custom.

## PlantUML — architecture diagrams

First choice for architecture and UML. Works like Mermaid: the source lives in
the file, and a tiny CDN encoder (`plantuml-encoder`, a few KB) turns it into a
`plantuml.com/plantuml/svg/…` image URL in the reader's browser — no local
install, no build step. Three parts, all in the template:

    <script src="https://cdn.jsdelivr.net/npm/plantuml-encoder@1.4.0/dist/plantuml-encoder.min.js"></script>

    <script type="text/plain" id="puml-arch" class="puml">
    @startuml
    skinparam backgroundColor transparent
    skinparam defaultFontName Inter
    skinparam ArrowColor #141413
    skinparam componentStyle rectangle
    component "Producer" as P #fbeee7;line:6a9bcc
    component "Queue"    as Q #fbeee7;line:d97757
    P --> Q : emit
    @enduml
    </script>
    <div data-diagram="puml-arch"></div>

The template's mount loop encodes every `script.puml` block, mounts it as an
`<img>` into the matching `data-diagram` div, mirrors the source into a
`<details>` block, and shows a readable error if the CDN or plantuml.com is
unreachable. Theme in the source (skinparam + `#hex;line:hex` per element) to
match the page palette.

**Caveats.** Rendering needs network at **view time** (plantuml.com) — a heavier
dependency than the CDN scripts, so always keep the embedded source +
`<details>` fallback in place. For a strictly offline artifact, pre-render to SVG
and inline it instead:
`curl -fsSL "https://www.plantuml.com/plantuml/svg/~h$(xxd -p d.puml | tr -d '\n')" -o d.svg`
(strip the SVG's fixed `width`/`height`, keep `viewBox`).

## ECharts — data charts

First choice for any real data series. The template pre-loads ECharts v5 from
jsdelivr (same CDN model as Tailwind/Mermaid). A chart needs a div with an
**explicit inline height** (Tailwind classes may not be processed when the init
script runs), an init call, and a resize hook:

    <div id="chart-x" style="height:320px"></div>
    <script>
      const c = echarts.init(document.getElementById('chart-x'));
      c.setOption({
        color: ['#6a9bcc', '#d97757', '#788c5d', '#c46686'],  // sys palette
        backgroundColor: 'transparent',
        textStyle: { fontFamily: 'inherit', color: '#141413' },
        tooltip: { trigger: 'axis' },
        /* xAxis / yAxis / series … */
      });
      addEventListener('resize', () => c.resize());
    </script>

Transparent background so the card surface shows through; series colors from the
sys palette; axis/split lines in `#e8e6dc`, labels in `#5e5d59`. Keep tooltips
on — that's the interactivity a static image can't give. One hero chart beats a
wall of thumbnails; tiny per-card inits for sparklines are fine.

## Mermaid — quick sketches & fallback

Pre-loaded (v11). Use it for gitGraph, mindmap, timeline, journey,
quadrantChart, block-beta — and as the fallback when the artifact must render
without plantuml.com. Any `<pre class="mermaid">` block auto-renders on page
load:

    <pre class="mermaid">
    gitGraph
      commit
      branch feature
      commit
      checkout main
      merge feature
    </pre>

The template initializes Mermaid with `theme: 'base'` and `themeVariables`
mapped to the page palette — swap the variables when re-skinning. Mermaid and
ECharts load from a CDN: cached after first fetch, but need network on first open
(same as the Tailwind dependency).

## The starter template

`template.html` (this directory) is a graphic-first starting point: a CSS Grid
canvas with a hero SVG diagram region, a colour-coded card grid, and a stats
band. It uses Tailwind CSS v4 via the browser build with an `@theme` token block
(Anthropic official palette — clay primary `#d97757` on cream `#faf9f5`, with
sky / olive / fig functional accents), and pre-loads Mermaid v11 themed to match,
ECharts v5, and plantuml-encoder (delete unused scripts). Palette source:
`anthropics/skills/brand-guidelines`. Clay accent is restricted to interactive
states (links, primary buttons) and at most one hero element per artifact — it's
a signal, not a decoration.

Light-only by design: most visual artifacts get read once or shared as a link,
and the dual-mode CSS adds noise without much payoff. Add a dark mode block back
in if the artifact really needs it.

Tailwind v4 specifics that bite if you guess instead of follow:

- Load `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` — **not** the v3
  `cdn.tailwindcss.com`.
- v4 has **no JS config object**. Configure inside
  `<style type="text/tailwindcss">` with `@theme { --color-x: …; }`; those tokens
  auto-generate utilities (`text-x`, `bg-x`, `stroke-x`).

The template is a starting point, **not** the output — strip every region the
artifact doesn't need, replace the example diagram with the actual picture this
artifact is built around, and replace the `@theme` palette with the project's
design-system values when one is available.
