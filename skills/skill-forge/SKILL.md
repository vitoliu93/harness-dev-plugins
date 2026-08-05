---
name: skill-forge
description: >-
  Create or improve a skill and graduate debrief candidates through eval gates.
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
- model-invoked → evals P=R=1.0 before ship
- SKILL.md body ≤700 tokens
- call-site row required
