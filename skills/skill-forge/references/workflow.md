# Skill forge workflow

```bash
PLUGIN=${CLAUDE_PLUGIN_ROOT:?set CLAUDE_PLUGIN_ROOT}
FORGE=${CLAUDE_SKILL_DIR}/scripts
```

## 0. Qualification — don't build

Build when: 3rd cross-session repeat, misrouting risk, scriptable compression.
Don't build: one-off, explain/summary, "maybe later".
Combine existing skills → SOP or call-site row. Near-neighbor → merge, don't fork.
Boundary required: "for X, not for Y".

## 1. Intent

Job, real inputs/outputs, neighbor exclusion, constraints. grill-me for CEO-only forks.

## 2. Invocation economics

- model-invoked: 2-line description + eval negative_concepts for neighbors
- user/hook only: `disable-model-invocation: true`, no evals
- No narrative in description or body

## 3. Trigger-first (model-invoked)

1. Add `evals/` (copy dispatch-vendors shape)
2. `trigger_eval.py` → P=R=1.0
3. `build_skill_atlas.py --workspace-root $PLUGIN/skills` → no pair ≥0.42
4. Use `fallback_positive_concepts`, don't stuff description

## 4. Body placement

SKILL.md ≤700 tokens (`context_sizer.py`). Depth → `references/`, steps → `scripts/`.
Fictionalize internal identifiers in public examples.

## 5. Ship checklist

- call-site.md row
- eval-delta on graduated candidates
- plugin-dev:skill-reviewer
- bump plugin.json + marketplace.json
- list exactly 3 next iterations

## Vendored tools

| script | use |
|---|---|
| trigger_eval.py | P/R gate |
| context_sizer.py | token budget |
| build_skill_atlas.py | overlap matrix |
| skill_usage.py | obs.db usage with aliases |

Stdlib-only; fix in place.
