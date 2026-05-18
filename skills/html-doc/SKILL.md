---
name: html-doc
description: >-
  Produce a single self-contained HTML file instead of Markdown for specs,
  plans, reports, PR/code explainers, design explorations, and throwaway
  editors. Use when an output is meant to be read, shared, or interacted with
  rather than diffed — long plans, leadership/status reports, PR writeups,
  design option comparisons, config/prompt/ticket editors, concept explainers.
  Trigger on "make an HTML file/artifact", "write this up", "explain this",
  "review this PR", "explore options", "build me a quick editor/tool".
argument-hint: [what the artifact should do]
---

# HTML over Markdown

Markdown is fine for things you edit by hand. But most agent output now gets
*read* and *shared*, not hand-edited — and a 100+ line Markdown plan rarely gets
read by anyone, including the person who asked for it. HTML carries far richer
information (tables, CSS, SVG diagrams, interactive controls, spatial layout)
and a link gets opened where Markdown attachments get ignored.

## The one rule

There is no template. Do **not** generate boilerplate. Before writing, decide
**what this specific artifact should let the person do** — read once and
understand? compare options side by side? tweak values and copy them back? —
then build exactly that. The skill is the judgment below, not a skeleton.

## When to choose HTML

Default to HTML when the output is:
- A spec, implementation plan, or brainstorm you expect to be >100 lines
- A report / status update / incident writeup for yourself, team, or leadership
- A PR writeup or code explainer (diffs, annotations, flow)
- Design exploration or component prototyping
- A purpose-built, throwaway tool to manipulate some data

Keep Markdown when the file is genuinely going to be hand-edited often, or when
clean version-control diffs matter (HTML diffs are noisy — a real tradeoff).

## Use-case patterns

**Exploration / planning.** Don't produce one plan — produce a web of HTML
files. Brainstorm N distinctly different options in one file laid out as a
comparison grid, each labeled with the tradeoff it makes. Expand the chosen one
into mockups + code snippets. Only then write the implementation plan. Pass the
whole set into a fresh session to implement.

**Code / PR understanding.** Render the actual diff with inline margin
annotations, color-code findings by severity, add flowcharts for the tricky
subsystem the reviewer flagged. This beats the default GitHub diff view —
attach one to PRs.

**Design / prototyping.** Sketch in HTML even when the target is React/Swift.
Add sliders and knobs for animations, easing, color. Always finish with a
**copy-the-parameters** button so tuned values come back as a paste-able prompt.

**Reports / explainers.** Synthesize across codebase, git history, MCPs (Slack,
Linear), and the web. Use SVG for the core diagram, annotate the 3–4 key code
snippets, end with a "gotchas" section. Optimize for someone reading it once.

**Throwaway editors.** A single purpose-built HTML file to reorder/triage/tag
data, edit constrained config, tune a prompt with live preview, or annotate a
doc. The non-negotiable: **end with an export** — "copy as JSON / Markdown /
prompt / diff" — that turns the UI state back into something paste-able into
Claude Code.

## Starter template

`references/template.html` is a self-contained starting point: Tailwind CSS
**v4** via the browser build, an `@theme` token block, readable typography,
auto dark mode, anchor-tab nav, severity callouts, and the export-button
pattern. It is a starting point, **not** the output — strip every section the
artifact doesn't need and replace `@theme` tokens with the project's real
design-system values.

Tailwind v4 specifics that bite if you guess instead of follow:
- Load `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` — **not** the v3
  `cdn.tailwindcss.com`.
- v4 has **no JS config object**. Configure inside
  `<style type="text/tailwindcss">` with `@theme { --color-x: …; }`; those
  tokens auto-generate utilities (`text-x`, `bg-x`).
- For static read-once docs, delete the `<script>` and export section.

## Techniques that make these good

- **Exploit ingestion.** The reason to do this in Claude Code, not a web UI:
  read the actual codebase / git history / MCP data and base the artifact on it.
- **Self-contained.** Inline CSS/JS so the file opens standalone in a browser.
- **Navigable & responsive.** Tabs, anchored sections, links; mobile-responsive
  so it reads on any form factor.
- **Match house style.** If a design-system HTML reference file exists (or build
  one once by pointing at the codebase), reference it so output isn't generic.
- **Always-export for interactive artifacts.** Any tool the user manipulates
  must round-trip its state back out as a prompt/JSON/diff.

## Delivering it

Write the `.html` file, then offer to open it in the browser
(`open <file>` on macOS). For a shareable link, the user uploads to S3 — don't
assume an upload path exists.

## Known tradeoffs (state them, don't hide them)

- Generation takes ~2–4× longer than Markdown.
- More tokens than Markdown (negligible against a large context window).
- HTML diffs are noisy — poor for things under heavy version control.
