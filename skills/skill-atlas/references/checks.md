# Fleet checks

Set once:

```bash
PLUGIN=${CLAUDE_PLUGIN_ROOT:?set CLAUDE_PLUGIN_ROOT}
ATLAS=${SKILL_ATLAS_DIR:-$HOME/.claude/observability/skill-atlas}
FORGE=$PLUGIN/skills/skill-forge/scripts
DB=${CCOBS_DIR:-$HOME/.claude/observability}/obs.db
```

## 1. Route overlap

```bash
python3 $FORGE/build_skill_atlas.py --workspace-root $PLUGIN/skills
```

Read `$ATLAS/atlas/route_overlap_matrix.csv`: pair ≥0.42 → tighten or merge.

## 2. Staleness

```bash
for d in $PLUGIN/skills/*/; do
  printf '%-16s %s\n' "$(basename $d)" "$(git -C $PLUGIN log -1 --format=%cs -- "skills/$(basename $d)")"
done | sort -k2
```

>90d untouched → flag refresh or archive via debrief.

## 3. Trigger eval

```bash
for d in $PLUGIN/skills/*/evals; do
  s=$(basename $(dirname $d))
  python3 $FORGE/trigger_eval.py --description-file $PLUGIN/skills/$s/SKILL.md \
    --cases $d/trigger_cases.json --semantic-config $d/semantic_config.json
done
```

Gate: P=R=1.0. Description edit without re-run = lint failure.

## 4. Context budget

```bash
python3 $FORGE/context_sizer.py $PLUGIN/skills/<name> --json
```

SKILL.md body >700 tokens → move detail to `references/`.

## 5. Call sites

Read [call-site.md](../call-site.md). Orphan/⚠ → wire or exempt (monthly hygiene: context-audit, skill-atlas).

## 6. Cross-refs

```bash
for d in $PLUGIN/skills/*/; do n=$(basename $d)
  hits=$(grep -rlw --include='*.md' "$n" $PLUGIN/skills | grep -v "/skills/$n/" \
    | sed 's|.*/skills/\([^/]*\)/.*|\1|' | sort -u)
  [ -n "$hits" ] && echo "$n ← $(echo "$hits" | tr '\n' ' ')"
done
```

Stale skill names in docs = lint failure.

## 7. Usage

Skip if no obs.db. Fold aliases via `aliases.json`:

```bash
python3 $PLUGIN/skills/skill-forge/scripts/skill_usage.py --db $DB --aliases $PLUGIN/skills/skill-atlas/aliases.json --days 30
```

Zero-use after description change ≠ death. Triage: scene absent / scene present but no trigger / inlined by ship.

Disable-model-invocation skills: slash-only, naturally low frequency.

External channels may resurrect deleted skill names — check obs.db before retiring.
