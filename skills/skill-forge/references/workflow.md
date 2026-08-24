# Skill forge workflow

```bash
SKILL_FORGE_DIR="<absolute path of the directory containing the loaded skill-forge/SKILL.md>";
SKILLS_ROOT="$SKILL_FORGE_DIR/..";
FORGE="$SKILL_FORGE_DIR/scripts";
```

Repeat these assignments in the same Bash call as each command below; shell
state does not persist between tool calls.

## 0. Qualification — don't build

Build when: 3rd cross-session repeat, misrouting risk, scriptable compression.
Don't build: one-off, explain/summary, "maybe later".
Combine existing skills → SOP or call-site row. Near-neighbor → merge, don't fork.
Boundary required: "for X, not for Y".

## 1. Intent

Job, real inputs/outputs, neighbor exclusion, constraints. grill-me for CEO-only forks.

## 2. Invocation economics

- model-invoked: 2-line description + eval negative_concepts for neighbors
- user/hook only: keep the description narrow; use `agents/openai.yaml` when Codex must block implicit invocation; no evals
- Apply [style-contract.md](style-contract.md): routing interface, present-tense runtime docs, portable paths, gate-preserving progressive disclosure, fictional public examples
- Run `bun "$FORGE/skill_style.ts" --workspace-root "$SKILLS_ROOT" --fail-on-issues`
- Run `bun "$SKILLS_ROOT/skill-style-review/scripts/review.ts" --skill-dir <skill-dir> --fail-on-issues`

## 3. Trigger-first (model-invoked)

1. Add `evals/` (copy use-agents shape)
2. `trigger_eval.ts` → P=R=1.0
3. `build_skill_atlas.ts --workspace-root "$SKILLS_ROOT" --fail-on-style` → style clean, no pair ≥0.42
4. Use `fallback_positive_concepts`, don't stuff description

## 4. Body placement

SKILL.md ≤700 tokens (`context_sizer.ts`). Depth → `references/`, steps → `scripts/`.
Fictionalize internal identifiers in public examples.
Preserve gates while moving detail; do not shorten by deleting lifecycle or safety rules.

## 5. Ship checklist

- call-site.md row
- zero deterministic and semantic style findings
- eval-delta on graduated candidates
- plugin-dev:skill-reviewer
- bump `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.codex-plugin/plugin.json` to the same version
- list exactly 3 next iterations

## Vendored tools

| script | use |
|---|---|
| trigger_eval.ts | P/R gate |
| context_sizer.ts | token budget |
| skill_style.ts | Skill & Doc Style gate |
| build_skill_atlas.ts | overlap matrix |
| skill_usage.ts | obs.db usage with aliases |

Stdlib-only; fix in place.

Semantic style review is owned by the independent `skill-style-review` skill.
It calls the shared `pi-call` layer; do not send the check to another agent.
