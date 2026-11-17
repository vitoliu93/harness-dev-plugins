# Recall queries

## Rule

**Recall is suspicion.** 规则摘要和 `observations.summary` 都是蒸馏出来的，不是真源。动手前回原始证据。

规则来自 rollup 的增量合并，`×N` 只说明这件事重复出现过 N 次，不说明它今天还对。

## Sync before query

Resolve the loaded `ccobs` skill path and set it as `CCOBS_SKILL_DIR` before
running the sync.

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing the loaded ccobs/SKILL.md>";
[ -f "$CCOBS_SKILL_DIR/scripts/ingest.ts" ] && bun "$CCOBS_SKILL_DIR/scripts/ingest.ts"
```

Skip if missing. Fresh sessions may have metadata but no summary yet.

## 第一栏：规则

摘要文件按项目分，文件名是 cwd 里的 `/` 换成 `-`；worktree 折算到主项目。跨项目的在 `_global.md`。

```bash
RULES="${CCOBS_DIR:-$HOME/.claude/observability}/rules"
KEY="$(pwd | sed 's#/\.claude/worktrees/.*##; s#/#-#g')"
grep -h "<keyword>" "$RULES/$KEY.md" "$RULES/_global.md" 2>/dev/null | head -8
```

- 语料只有几百 KB，`grep` 够用，不需要索引
- 中英文关键词各试一次
- 一条都没有 → 这个话题还没沉淀出规则，正常

## 第二栏：先例

```sql
sqlite3 -header ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db \
  "SELECT date(s.started_at) d, o.task_type, o.outcome, substr(o.summary,1,120) s, s.session_id sid
   FROM observations o JOIN sessions s USING(session_id)
   WHERE o.summary LIKE '%<keyword>%'
   ORDER BY s.started_at DESC LIMIT 5"
```

- Try Chinese and English keywords
- Narrow: `AND s.project LIKE '%<repo>%'`
- Mark rows >90 days with ⚠
- Non-claude sources may be backfill-only — "no hits" is weak signal, not proof absent
- No DB → treat as no precedent, don't error

## Output format

```
规则 · <keyword>
- <rule> ×<n> (最近 <date>)
先例 · <keyword>
- <date> [<task_type>/<outcome>] <one line> ⚠ · <sid>
结论: <有先例可续用 | 有先例但需重验 | 无先例,放心开工>
```

两栏都空就直接说没有。

Re-verify: `SELECT file_path FROM sessions WHERE session_id='<sid>'` then read transcript.

规则被今天的事实推翻了 → 交给 `/debrief` 改摘要文件，不要在这里改。
