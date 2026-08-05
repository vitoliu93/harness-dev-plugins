# Take over and save handoff

## Sync ledger first

```bash
CCOBS_SKILL_DIR=${CCOBS_SKILL_DIR:-${CLAUDE_PLUGIN_ROOT}/skills/ccobs}
[ -f "$CCOBS_SKILL_DIR/scripts/ingest.ts" ] && bun "$CCOBS_SKILL_DIR/scripts/ingest.ts"
```

Skip silently if missing.

`HANDOFF_DIR=${HANDOFF_DIR:-${TMPDIR:-/tmp}}`

## Locate session

```bash
sqlite3 -header ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db \
  "SELECT session_id, source, kind, cwd, git_branch, ended_at, file_path
   FROM sessions WHERE session_id LIKE '%<frag>%'"
```

- **session id** → query above; fallback `~/.claude/projects/*/<id>*.jsonl`
- **task description** → observations.summary + recent sessions by project/title
- **Gitee issue** → gitee-operator for title/body, then keyword search

Operate in original `cwd`, not current directory.

## Read context (priority)

1. `docs/advanced-plans/` match → resume via advanced-plan, exit this skill
2. `"$HANDOFF_DIR"/handoff-*.md`
3. Transcript probes (user messages, assistant narrative, edited files, tail)
4. git status/log/worktree — git wins over transcript

Large transcript → sonnet subagent for probes; host reads tail + key files.

Cursor bodies: see ccobs [queries.md](../ccobs/references/queries.md).

## Brief before work

Goal · boundaries (every user correction) · progress · failed attempts · next steps.

## Save handoff (secondary)

Triggers: handoff / 交接 / save progress / quota warning.

Write `"$HANDOFF_DIR"/handoff-<date>-<project>-<title>.md` with Goal / Done / State / Issues / Failed / Discoveries / Next / Files / Gotchas.

Give paste-ready line: `读 $HANDOFF_DIR/handoff-….md,按 Next Steps 继续…`

## Iron rules

Recall observations are clues only. User corrections = boundaries. Don't redo git-landed work.
