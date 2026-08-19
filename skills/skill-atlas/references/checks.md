# Fleet checks

Use this prefix in every Bash call below; shell state does not persist between
tool calls.

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
ATLAS=${SKILL_ATLAS_DIR:-$HOME/.claude/observability/skill-atlas};
FORGE="$SKILLS_ROOT/skill-forge/scripts";
DB=${CCOBS_DIR:-$HOME/.claude/observability}/obs.db;
```

## 1. Deterministic Skill & Doc Style

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
FORGE="$SKILLS_ROOT/skill-forge/scripts";
bun "$FORGE/skill_style.ts" --workspace-root "$SKILLS_ROOT" --fail-on-issues
```

Gate: zero findings across every skill; atlas scope policy cannot exempt style violations. Repair with the
[style contract](../../skill-forge/references/style-contract.md): two-line routing interface,
present-tense runtime rules, configurable paths, gate-preserving progressive disclosure, and fictional public examples.
Keep dates only when they are active compatibility cutoffs.

Atlas also writes `$ATLAS/atlas/style_issues.json`; any finding blocks the commit gate.

## 2. Semantic Skill & Doc Style

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
ATLAS=${SKILL_ATLAS_DIR:-$HOME/.claude/observability/skill-atlas};
STYLE_REVIEW="$SKILLS_ROOT/skill-style-review";
LLM_CALL="$SKILLS_ROOT/llm-call";
bun add -g openai@7
LLM_CALL_DIR="$LLM_CALL" bun "$STYLE_REVIEW/scripts/review.ts" \
  --workspace-root "$SKILLS_ROOT" \
  --output $ATLAS/atlas/semantic_style_issues.json \
  --fail-on-issues
```

Gate: zero origin-story, incident-lore, tuition-narrative,
marketing-language, meaning-level prose-wall, or gate-loss findings. Missing
`DEEPSEEK_API_KEY` means the audit is incomplete, not clean. The reviewer calls the `llm-call` atom at maximum reasoning effort, then
adjudicates candidates; the commit hook remains deterministic and does not make
remote API calls.

## 3. Route overlap

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
FORGE="$SKILLS_ROOT/skill-forge/scripts";
bun "$FORGE/build_skill_atlas.ts" --workspace-root "$SKILLS_ROOT" --fail-on-style
```

Read `$ATLAS/atlas/route_overlap_matrix.csv`: pair ≥0.42 → tighten or merge.

## 4. Staleness

The atlas derives each skill's `updated_at` from its git last-commit date
(`manifest.json` `updated_at` overrides when present); >120d → `stale_skills`
finding. Manual sweep for context:

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
PLUGIN_ROOT="$(cd "$SKILLS_ROOT/.." && pwd -P)";
for d in "$SKILLS_ROOT"/*/; do
  printf '%-16s %s\n' "$(basename "$d")" "$(git -C "$PLUGIN_ROOT" log -1 --format=%cs -- "skills/$(basename "$d")")"
done | sort -k2
```

>90d untouched → flag refresh or archive via debrief.

Portfolio checks can be disabled fleet-wide in `$SKILLS_ROOT/skill-atlas/policy.json`
`disabled_checks` (e.g. `owner_review_gaps` on a single-maintainer fleet). Style
findings cannot be disabled.

## 5. Trigger eval

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
FORGE="$SKILLS_ROOT/skill-forge/scripts";
for d in "$SKILLS_ROOT"/*/evals; do
  s=$(basename "$(dirname "$d")")
  bun "$FORGE/trigger_eval.ts" --description-file "$SKILLS_ROOT/$s/SKILL.md" \
    --cases "$d/trigger_cases.json" --semantic-config "$d/semantic_config.json"
done
```

Gate: P=R=1.0. Description edit without re-run = lint failure.

## 6. Context budget

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
FORGE="$SKILLS_ROOT/skill-forge/scripts";
bun "$FORGE/context_sizer.ts" "$SKILLS_ROOT/<name>" --json
```

SKILL.md body >700 tokens → move detail to `references/`.

## 7. Call sites

Read [call-site.md](../call-site.md). Orphan/⚠ → wire or exempt (monthly hygiene: context-audit, skill-atlas).

## 8. Cross-refs

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
for d in "$SKILLS_ROOT"/*/; do n=$(basename "$d")
  hits=$(grep -rlw --include='*.md' "$n" "$SKILLS_ROOT" | grep -v "/skills/$n/" \
    | sed 's|.*/skills/\([^/]*\)/.*|\1|' | sort -u)
  [ -n "$hits" ] && echo "$n ← $(echo "$hits" | tr '\n' ' ')"
done
```

Stale skill names in docs = lint failure.

## 9. Usage

Skip if no obs.db. Fold aliases via `aliases.json`:

```bash
ATLAS_SKILL_DIR="<absolute path of the directory containing the loaded skill-atlas/SKILL.md>";
SKILLS_ROOT="$ATLAS_SKILL_DIR/..";
DB=${CCOBS_DIR:-$HOME/.claude/observability}/obs.db;
bun "$SKILLS_ROOT/skill-forge/scripts/skill_usage.ts" --db "$DB" --aliases "$SKILLS_ROOT/skill-atlas/aliases.json" --days 30
```

Zero-use after description change ≠ death. Triage: scene absent / scene present but no trigger / inlined by ship.

Explicit-only skills are naturally low frequency.

External channels may resurrect deleted skill names — check obs.db before retiring.
