---
name: plan-prototype
description: >-
  Render what you are about to build as an interactive prototype.html — the user
  approves the target instead of reading the plan。Use when 有设计源(原型 / 设计稿 /
  PRD / Figma),或界面 / 布局 / 交互 改造("按原型实现"、"先给我看看你要做成什么样")。
argument-hint: "[plan slug or what is being built]"
---

# plan-prototype

Plans are read by agents; users approve *pictures*. Write the plan for the
agent, and render the same understanding as one HTML file the user clicks
through — that file is the only thing they approve.

Two failures this kills: a 100KB design source nobody read whole (you cannot
mock what you have not read), and a delivery graded on an axis no gate measured
(after approval, this file *is* that axis).

## Output

One self-contained file at `docs/advanced-plans/<date>-<slug>/prototype.html`,
committed with the plan, no external requests.

**User-visible** → the real screen: real layout proportions, labels **copied
verbatim** from the source (never re-worded, never "improved"), real control
ranges, fake data, and every state the task touches reachable by clicking
(empty / loading / error / selected / disabled). A screenshot is not this.

**Backend / infra** → the shape of the change: components and boundaries, data
flow, entity relationships, the sequence of the one or two critical paths.
Nodes click open to the concrete contract (endpoint, payload, table, invariant).

## The one rule: label provenance

```html
<section data-src="PRD §3.6">…</section>
<section data-src="推断" class="inferred">…</section>
```

`推断` blocks render visibly different (dashed + tinted), and the header carries
a live count: `参考真源: docs/refs/x/proto.html · 推断 7 处`.

That count is why the file is worth a minute of the user's time: they are not
proofreading you, they are scanning for **your guesses** — which is exactly the
set of questions worth asking, asked once, where answering is cheap. Source
silent → mark 推断 and keep it minimal; don't design new product. Sources
contradict → mark 冲突 and show both.

## Gates

- **Before writing**: reference sources are in-repo (`docs/refs/<slug>/`) and
  you read them end to end. Grepping a design source and mocking from the hits
  reproduces the exact failure this skill prevents.
- **After approval**: discussion is over, execution runs uninterrupted — that's
  the trade. Understanding changes mid-flight → update `prototype.html` and say
  so in one line; never drift silently.
- **Goal/stop conditions name this file**: "built as approved in
  `prototype.html`" is decidable; "ship the kickoff doc" is satisfiable by
  editing a document.

## Afterwards it is load-bearing

`goal.md` 参考真源 points at it · vendor and subagent briefs cite its **path**,
never a prose retelling · acceptance compares against it · it survives
compaction because it is in the repo. Delivery diverges → you can name which
blocks, because both sides exist.

Rendering conventions (diagram engines, layout patterns, the self-contained
template) come from `create-readable-html` — borrow them. The difference is
lifecycle: this file is committed, approved, then held up against the result.
