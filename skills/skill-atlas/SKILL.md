---
name: skill-atlas
description: >-
  Run fleet health checks on skills: overlap, staleness, trigger evals, budget, and usage.
  Use when auditing the skill collection or before shipping SKILL.md changes.
argument-hint: "[optional: skill name to focus on]"
metadata:
  kind: meta
---

# skill-atlas

Run checks, then report. Details: [checks.md](references/checks.md).

```bash
PLUGIN=${CLAUDE_PLUGIN_ROOT:?set CLAUDE_PLUGIN_ROOT}
ATLAS=${SKILL_ATLAS_DIR:-$HOME/.claude/observability/skill-atlas}
```

## Report skeleton

```
skill-atlas · <date>
overlap : N pairs, M collisions
stale   : <skills >90d | none>
triggers: <per-skill P/R | missing fixtures>
budget  : <over 700 | all within>
callsite: <orphans/⚠ | wired>
xref    : <stale names | clean>
usage   : <top/zero | post-change zero | obs.db absent>
proposed: <actions → debrief Move 3>
```

Feed proposed actions to debrief Move 3.
