# Recall queries

## Rule

**Recall is suspicion.** `observations.summary` is distilled, not ground truth. Re-read original evidence before acting.

## Sync before query

Resolve the loaded `ccobs` skill path and set it as `CCOBS_SKILL_DIR` before
running the sync.

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing the loaded ccobs/SKILL.md>";
[ -f "$CCOBS_SKILL_DIR/scripts/ingest.ts" ] && bun "$CCOBS_SKILL_DIR/scripts/ingest.ts"
```

Skip if missing. Fresh sessions may have metadata but no summary yet.

## Query

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
先例 · <keyword>
- <date> [<task_type>/<outcome>] <one line> ⚠ · <sid>
结论: <有先例可续用 | 有先例但需重验 | 无先例,放心开工>
```

Re-verify: `SELECT file_path FROM sessions WHERE session_id='<sid>'` then read transcript.

Zero hits is a valid answer.
