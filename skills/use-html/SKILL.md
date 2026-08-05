---
name: use-html
description: >-
  Build one self-contained HTML explainer or clickable pre-build prototype.
  Use for visual explainers, infographics, or approval prototypes before UI or PRD work.
argument-hint: "[what to show | prototype <plan slug>]"
metadata:
  kind: atom
---

# use-html

Produce one self-contained HTML file. First choose exactly one mode:

- **Explainer**：用户要看懂现有信息、架构、对比、流程或数据时，读
  `references/explainer.md`。
- **Prototype**：用户要在实施前确认目标界面、交互或系统形状时，读
  `references/prototype.md`，再按其中指引读取 explainer 的绘图材料。

Do not load both protocols for an ordinary explainer. Both modes share three
rules: use real source data, choose a visual shape before prose, and return the
written file path rather than dumping HTML into chat.
