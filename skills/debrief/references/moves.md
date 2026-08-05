# Debrief moves — archive, memory, promotion

## Move 1 — Archive

When `docs/advanced-plans/<date>-<slug>/` belongs to this task:

1. Fill `review.md` if still template (3–6 process bullets). Already filled → skip.
2. Set `todo.md` Current State to `Status: closed`.
3. Move to `docs/advanced-plans/_archive/<date>-<slug>/`; commit `chore(<slug>): archive plan`.
   Multi-repo workspace root → move only, no commit.

No plan dir → skip silently.

## Move 2 — Distill memory

At most **one** memory per task in project auto-memory (`~/.claude/projects/<project>/memory/`).

Litmus: would next-session-me err without this? Already in repo/code/plan → skip.

Types: `feedback` | `decision` | `postmortem` | `reference`. Postmortem/decision need live `status:`.

Search existing memories; prefer update over duplicate. Bump `MEMORY.md` index.

## Move 3 — Promote

### 1. Recurrence

Track in `<memory-dir>/SKILL-CANDIDATES.md`. Same-session repeats ≥2 count strongly.
Cross-check ccobs `sop_candidate` when available:

```bash
sqlite3 ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db \
  "SELECT sop_candidate, COUNT(*) c FROM observations WHERE sop_candidate IS NOT NULL GROUP BY sop_candidate HAVING c>=2"
```

At **seen ≥ 3** → propose `skill-forge` (ask user). Apply near-neighbor + boundary tests before proposing.

### 2. Harness drift

Fix stale paths, wrong assumptions, missing hooks/templates in the harness repo when fresh.
For `dispatch-vendors`: read `${CCOBS_DIR:-$HOME/.claude/observability}/dispatch/ledger.md`; split `why:obs` vs `why:econ`.

For compaction: read `${CCOBS_DIR:-$HOME/.claude/observability}/compaction.jsonl` for this session.
Repeated `dropped` anchors (参考真源, prototype.html, done criteria) → fix plan-anchor / goal.md anchors, not longer summaries.

### 3. Audit signal

Append「建议召集 cto-audit:<原因>」when either hits:
- Same structural theme ≥3× in LEARNED.md / SKILL-CANDIDATES.md
- `docs/audit/` constitution stale or recurring bugs hit existing rules

Otherwise skip.
