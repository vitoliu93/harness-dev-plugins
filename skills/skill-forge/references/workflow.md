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
- Apply [style-contract.md](style-contract.md): routing interface, present-tense runtime docs, portable paths, gate-preserving progressive disclosure, fictional public examples
- Run `python3 $FORGE/skill_style.py --workspace-root $PLUGIN/skills --fail-on-issues`
- Run `bun add -g openai@7`
- Run `LLM_CALL_RUNNER=$PLUGIN/skills/llm-call/scripts/call.ts bun $PLUGIN/skills/skill-style-review/scripts/review.ts --skill-dir <skill-dir> --fail-on-issues`

## 3. Trigger-first (model-invoked)

1. Add `evals/` (copy dispatch-vendors shape)
2. `trigger_eval.py` → P=R=1.0
3. `build_skill_atlas.py --workspace-root $PLUGIN/skills --fail-on-style` → style clean, no pair ≥0.42
4. Use `fallback_positive_concepts`, don't stuff description

## 4. Body placement

SKILL.md ≤700 tokens (`context_sizer.py`). Depth → `references/`, steps → `scripts/`.
Fictionalize internal identifiers in public examples.
Preserve gates while moving detail; do not shorten by deleting lifecycle or safety rules.

## 5. Ship checklist

- call-site.md row
- zero deterministic and semantic style findings
- eval-delta on graduated candidates
- plugin-dev:skill-reviewer
- bump plugin.json + marketplace.json
- list exactly 3 next iterations

## Vendored tools

| script | use |
|---|---|
| trigger_eval.py | P/R gate |
| context_sizer.py | token budget |
| skill_style.py | Skill & Doc Style gate |
| build_skill_atlas.py | overlap matrix |
| skill_usage.py | obs.db usage with aliases |

Stdlib-only; fix in place.

Semantic style review is owned by the independent `skill-style-review` skill.
It calls the `llm-call` atom; do not dispatch a vendor.
