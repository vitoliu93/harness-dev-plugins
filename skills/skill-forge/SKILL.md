---
name: skill-forge
description: >-
  Create or improve a skill through style, routing, budget, and trigger-eval gates.
  Use when forging a skill, fixing routing, or graduating a recurring-pattern candidate.
metadata:
  kind: meta
---

# skill-forge

Full workflow: [workflow.md](references/workflow.md).

```bash
PLUGIN=${CLAUDE_PLUGIN_ROOT:?set CLAUDE_PLUGIN_ROOT}
FORGE=${CLAUDE_SKILL_DIR}/scripts
```

## Hard gates

- Near-neighbor indistinguishable → merge, don't create
- Deterministic runtime style → zero `skill_style.py` findings
- Semantic runtime style → zero `skill-style-review` findings
- model-invoked → evals P=R=1.0 before ship
- SKILL.md body ≤700 tokens
- call-site row required

Style rules and remediation: [style-contract.md](references/style-contract.md).
