---
name: skill-forge
description: >-
  Create or improve a skill, or check the whole fleet, through style, routing, budget, and trigger-eval gates.
  Use when forging a skill, fixing routing, graduating a recurring-pattern candidate, or auditing the skill collection.
metadata:
  kind: meta
---

# skill-forge

Full workflow: [workflow.md](references/workflow.md).

```bash
SKILL_FORGE_DIR="<absolute path of the directory containing this SKILL.md>";
SKILLS_ROOT="$SKILL_FORGE_DIR/..";
FORGE="$SKILL_FORGE_DIR/scripts";
```

## Hard gates

- Near-neighbor indistinguishable → merge, don't create
- Deterministic runtime style → zero `skill_style.ts` findings
- Semantic runtime style → zero `style_review.ts` findings (model judge through `pi`, key `skill-style-review` or `default` in llm.json)
- model-invoked → evals P=R=1.0 before ship
- SKILL.md body ≤700 tokens
- call-site row required

Style rules and remediation: [style-contract.md](references/style-contract.md).
Semantic review CLI, output schema, and categories: [style-review-contract.md](references/style-review-contract.md).

## Fleet check

Run every check in [fleet-checks.md](references/fleet-checks.md), then report:

```
skill fleet · <date>
style   : <violations by skill | clean>
semantic: <violations by skill | clean | not run>
overlap : N pairs, M collisions
stale   : <skills >120d | none>
triggers: <per-skill P/R | missing fixtures>
budget  : <over 700 | all within>
callsite: <orphans/⚠ | wired>
xref    : <stale names | clean>
usage   : <top/zero | post-change zero | obs.db absent>
inject  : <hooks under 10% followed | all kept>
proposed: <actions → debrief Move 3>
```
