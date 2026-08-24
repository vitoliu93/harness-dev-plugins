---
name: skill-style-review
description: >-
  Review skill runtime prose for semantic style violations and gate loss.
  Use when creating, improving, or auditing skill documentation.
metadata:
  kind: atom
  requires:
    bins: ["bun", "pi"]
---

# skill-style-review

Run the bundled Bun script directly; do not route through `orchestrate` or a general executor.

```bash
STYLE_REVIEW_DIR="<absolute path of the directory containing this SKILL.md>";
bun "$STYLE_REVIEW_DIR/scripts/review.ts" --skill-dir <skill-dir> --fail-on-issues
```

Fleet audit:

```bash
STYLE_REVIEW_DIR="<absolute path of the directory containing this SKILL.md>";
bun "$STYLE_REVIEW_DIR/scripts/review.ts" \
  --workspace-root <skills-root> --output <report.json> --fail-on-issues
```

## Hard gates

- Run deterministic `skill_style.ts` first; this skill judges semantics, not path or frontmatter shape.
- Call the shared `pi-call` layer; keep provider handling out of this skill.
- Keep this skill directory dependency-free: no `package.json`, `node_modules`, or lockfile.
- Require a `skill-style-review` or `default` key in `${CCOBS_DIR:-$HOME/.claude/observability}/llm.json`; never fall back to another agent.
- Run the fixed eval after changing either prompt.
- Return file, line, exact evidence, category, reason, and imperative rewrite for every finding.
- Treat a retained date as valid only when it changes current runtime behavior.
- Preserve safety and lifecycle gates while removing narrative.

CLI, configuration, output schema, and category rules:
[review-contract.md](references/review-contract.md).
