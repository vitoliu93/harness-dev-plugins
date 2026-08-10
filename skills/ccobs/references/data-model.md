# Data model and sources

## Source vs model

Harness and engine are orthogonal: `sessions.source` is the tool; `turns.model` is the engine per turn.
dscode/arkcode sessions stay `source='claude-code'`; filter by model.

```sql
WHERE s.source='claude-code' AND t.model LIKE 'claude-%'
SELECT * FROM v_tool_overview;
WHERE t.model LIKE 'deepseek%'
```

## Nine adapters

| source | raw location | increment | tokens | body detail | skill/subagent |
|---|---|---|---|---|---|
| claude-code | `~/.claude/projects/**/*.jsonl` | byte offset + Stop queue | per turn | distill only | yes |
| codex | `~/.codex/sessions/**/rollout-*.jsonl` | byte offset | token_count | no | subagent yes |
| droid | `~/.factory/sessions/*/*.jsonl` | byte offset | no | no | Skill/Task |
| grok | `~/.grok/sessions/<enc-cwd>/<uuid>/` | events offset | no | no | spawn_subagent |
| opencode | `~/.local/share/opencode/opencode.db` | time_updated | per message | no | skill/task |
| cursor-ide | Cursor state.vscdb (read-only) | composerData watermark | ~0 | message_parts | no |
| cursor-agent | `~/.cursor/chats/*/*/store.db` | meta.json watermark | no | message_parts | no |
| kimi-code | `~/.kimi-code/sessions/.../wire.jsonl` | byte offset | usage.record | no | Skill/Agent |
| pi | `~/.pi/agent/sessions/<cwd-slug>/*.jsonl` | byte offset | per turn | no | no |

`project` = CC dir encoding of cwd; hooks are claude-code only.
