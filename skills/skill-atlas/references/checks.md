# Fleet checks

Set once:

```bash
PLUGIN=${CLAUDE_PLUGIN_ROOT:?set CLAUDE_PLUGIN_ROOT}
ATLAS=${SKILL_ATLAS_DIR:-$HOME/.claude/observability/skill-atlas}
FORGE=$PLUGIN/skills/skill-forge/scripts
DB=${CCOBS_DIR:-$HOME/.claude/observability}/obs.db
```

## 1. Deterministic Skill & Doc Style

```bash
python3 $FORGE/skill_style.py --workspace-root $PLUGIN/skills --fail-on-issues
```

Gate: zero findings across every skill; atlas scope policy cannot exempt style violations. Repair with the
[style contract](../../skill-forge/references/style-contract.md): two-line routing interface,
present-tense runtime rules, configurable paths, gate-preserving progressive disclosure, and fictional public examples.
Keep dates only when they are active compatibility cutoffs.

Atlas also writes `$ATLAS/atlas/style_issues.json`; any finding blocks the commit gate.

## 2. Semantic Skill & Doc Style

```bash
STYLE_REVIEW=$PLUGIN/skills/skill-style-review
LLM_CALL=$PLUGIN/skills/llm-call
bun add -g openai@7
LLM_CALL_RUNNER=$LLM_CALL/scripts/call.ts bun $STYLE_REVIEW/scripts/review.ts \
  --workspace-root $PLUGIN/skills \
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
python3 $FORGE/build_skill_atlas.py --workspace-root $PLUGIN/skills --fail-on-style
```

Read `$ATLAS/atlas/route_overlap_matrix.csv`: pair ≥0.42 → tighten or merge.

## 4. Staleness

```bash
for d in $PLUGIN/skills/*/; do
  printf '%-16s %s\n' "$(basename $d)" "$(git -C $PLUGIN log -1 --format=%cs -- "skills/$(basename $d)")"
done | sort -k2
```

>90d untouched → flag refresh or archive via debrief.

## 5. Trigger eval

```bash
for d in $PLUGIN/skills/*/evals; do
  s=$(basename $(dirname $d))
  python3 $FORGE/trigger_eval.py --description-file $PLUGIN/skills/$s/SKILL.md \
    --cases $d/trigger_cases.json --semantic-config $d/semantic_config.json
done
```

Gate: P=R=1.0. Description edit without re-run = lint failure.

## 6. Context budget

```bash
python3 $FORGE/context_sizer.py $PLUGIN/skills/<name> --json
```

SKILL.md body >700 tokens → move detail to `references/`.

## 7. Call sites

Read [call-site.md](../call-site.md). Orphan/⚠ → wire or exempt (monthly hygiene: context-audit, skill-atlas).

## 8. Cross-refs

```bash
for d in $PLUGIN/skills/*/; do n=$(basename $d)
  hits=$(grep -rlw --include='*.md' "$n" $PLUGIN/skills | grep -v "/skills/$n/" \
    | sed 's|.*/skills/\([^/]*\)/.*|\1|' | sort -u)
  [ -n "$hits" ] && echo "$n ← $(echo "$hits" | tr '\n' ' ')"
done
```

Stale skill names in docs = lint failure.

## 9. Usage

Skip if no obs.db. Fold aliases via `aliases.json`:

```bash
python3 $PLUGIN/skills/skill-forge/scripts/skill_usage.py --db $DB --aliases $PLUGIN/skills/skill-atlas/aliases.json --days 30
```

Zero-use after description change ≠ death. Triage: scene absent / scene present but no trigger / inlined by ship.

Disable-model-invocation skills: slash-only, naturally low frequency.

External channels may resurrect deleted skill names — check obs.db before retiring.
