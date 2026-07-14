---
name: skill-atlas
description: >-
  Fleet health check for the skill collection: route-overlap matrix, staleness
  signal, per-skill trigger eval, and context budget — powered by the
  yao-meta-skill upstream tools (stdlib-only, offline).
argument-hint: "[optional: skill name to focus on]"
---

# skill-atlas

Engine lives in the upstream checkout — set once:

```bash
YAO=~/codebase/github/yao-meta-skill
PLUGIN=~/codebase/projects/agent-plugins
```

Run the four checks, then report. A description edit without re-running its
eval is a lint failure — say so when you see one.

## 1. Route overlap (all skills, no fixtures needed)

```bash
python3 $YAO/scripts/build_skill_atlas.py --workspace-root $PLUGIN/skills \
  --output-dir /tmp/atlas
```

Read `route_overlap_matrix.csv`: any pair ≥ 0.42 = collision → propose
tightening one description or merging the skills. Point `--workspace-root` at
`$PLUGIN` instead to include `archive/` (useful before un-archiving something).

## 2. Staleness (git is the signal — skills carry no manifest)

```bash
for d in $PLUGIN/skills/*/; do
  printf '%-16s %s\n' "$(basename $d)" "$(git -C $PLUGIN log -1 --format=%cs -- "skills/$(basename $d)")"
done | sort -k2
```

Untouched > ~90 days → flag: still routing correctly? still true? Propose
refresh or retirement (archive/, never delete) via debrief Move 3.

## 3. Trigger eval (skills that have `evals/` fixtures)

```bash
for d in $PLUGIN/skills/*/evals; do
  s=$(basename $(dirname $d))
  python3 - <<PY  # extract description from frontmatter
import re; t=open("$PLUGIN/skills/$s/SKILL.md").read()
m=re.search(r'description: >-\n((?:  .*\n)+)', t)
open("/tmp/desc-$s.txt","w").write(" ".join(l.strip() for l in m.group(1).splitlines()))
PY
  python3 $YAO/scripts/trigger_eval.py --description-file /tmp/desc-$s.txt \
    --cases $d/trigger_cases.json --semantic-config $d/semantic_config.json
done
```

Gate: precision = recall = 1.0. Any FP/FN → fix the description wording (or a
genuinely wrong case) before shipping. New skill → copy the fixture shape from
`skills/dispatch/evals/` (cases: should / should-not / near-neighbor buckets;
config: 3-5 concept buckets whose phrases must appear in the description —
coverage is computed against description-anchored concepts).

## 4. Context budget

```bash
python3 $YAO/scripts/context_sizer.py $PLUGIN/skills/<name> --json
```

SKILL.md body over ~700 tokens → move detail into `references/` (progressive
disclosure), like `dispatch/references/engines.md`.

## 5. Call sites (judgment, not computed)

Read `call-site.md` — one row per atom, hand-maintained (call site is a
judgment, not a computable property, so it stays out of `build_skill_atlas.py`).
Every atom needs an honest call site: ① a workflow stage, ② a hook/timer, or
③ trigger-word muscle memory. List rows typed `orphan` or flagged ⚠: for each,
either propose a wiring point or confirm the "低频按需是天性,非病" exemption
(monthly-hygiene atoms — audit-context/docs-organize/skill-atlas — are exempt).
A new atom whose call site you can't fill shouldn't have shipped — flag it;
every added/renamed atom is one row in this table, part of its own diff.

## Report

```
skill-atlas · <date>
overlap : N pairs, M collisions (list pairs ≥0.42 | none)
stale   : <skills >90d untouched | none>
triggers: <per-skill P/R | which skills lack fixtures>
budget  : <skills over 700 tokens | all within>
callsite: <orphans/⚠ wanting a wiring point | all wired or exempt>
proposed: <merge/tighten/refresh/retire actions → feed debrief Move 3>
```
