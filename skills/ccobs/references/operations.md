# Operations and layout

## Layout

- DB / queue / logs: `${CCOBS_DIR:-$HOME/.claude/observability/}` (override with `CCOBS_DIR`).
- Model routing: `${CCOBS_DIR}/llm.json`，平表 `{"<场景>": "<provider>/<model>[:思考档]"}`。`pi-call.ts` 是唯一的读取者，插件里不写死任何模型；缺文件就跳过。场景键：`default`、`distill`、`rollup`、`recall`、`prompt-forge`、`skill-style-review`、`vision`。认证归 pi，不归这里。独立 agent 的渠道来自 `${AGENTS_CONFIG:-${CCOBS_DIR:-$HOME/.claude/observability}/agents/agents.json}`。
- Dynamic ledgers never live in the plugin repo.
- Scripts under `$CCOBS_SKILL_DIR/scripts/` after setting `CCOBS_SKILL_DIR` to
  the absolute directory containing the loaded `ccobs/SKILL.md`:
  - `schema.sql`, `ingest.ts`, `obs-enqueue.ts`, `install.sh`, `distill.ts`, `distill-prompt.md`
- Keep each `CCOBS_SKILL_DIR` assignment and use in the same shell command;
  shell state does not persist between tool calls.
- `message_parts` may contain secrets — redact before sharing.

## Install and ingest

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing the loaded ccobs/SKILL.md>";
bash "$CCOBS_SKILL_DIR/scripts/install.sh"
bun "$CCOBS_SKILL_DIR/scripts/ingest.ts"
bun "$CCOBS_SKILL_DIR/scripts/ingest.ts" --source codex
bun "$CCOBS_SKILL_DIR/scripts/ingest.ts" --queue
bun "$CCOBS_SKILL_DIR/scripts/ingest.ts" --project <keyword>
sqlite3 -header -column ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db "SELECT * FROM v_tool_overview"
bun "$CCOBS_SKILL_DIR/scripts/distill.ts" --dry-run
```

## On-demand sync

Recent sessions may not be ingested yet. Before recall or take-over, run incremental ingest (idempotent):

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing the loaded ccobs/SKILL.md>";
[ -f "$CCOBS_SKILL_DIR/scripts/ingest.ts" ] && bun "$CCOBS_SKILL_DIR/scripts/ingest.ts"
```

Skip silently if the script is missing. Verify with `sqlite3 ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db`.
