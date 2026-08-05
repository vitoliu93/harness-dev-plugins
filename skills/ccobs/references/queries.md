# Views and Cursor body queries

## Seven views

| view | question |
|---|---|
| `v_tool_overview` | per-tool allocation + completeness |
| `v_skill_usage` | hot vs dead skills |
| `v_agent_spawns` | explicit spawn model discipline |
| `v_token_economy` | tokens by model × kind × source |
| `v_hook_health` | hook runs (claude-code) |
| `v_weekly_activity` | sessions/subagents by project/week |
| `v_session_quality` | task_type × outcome (distilled) |

## Cursor message_parts

```sql
SELECT session_id, source, cwd, started_at, ended_at
FROM sessions WHERE source IN ('cursor-ide','cursor-agent') ORDER BY ended_at DESC;

SELECT seq, part_index, role, part_type, tool_name, content, data_json
FROM message_parts WHERE session_id = '<id>'
ORDER BY seq IS NULL, seq, part_index;
```

Stats views do not include body coverage — use `message_parts JOIN sessions` for that.
