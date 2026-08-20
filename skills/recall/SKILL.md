---
name: recall
description: >-
  Look up what past sessions across all clients established on a topic: rolled-up rules plus up to five precedents.
  Use before research or implementation when checking whether this was investigated before.
argument-hint: "[主题关键词]"
metadata:
  kind: meta
---

# recall

**Recall is suspicion** — rules and summaries are clues, not facts. Re-verify before code or reports.

Two columns, different sources:

| 栏 | 来源 | 说明 |
|---|---|---|
| 规则 | `${CCOBS_DIR:-$HOME/.claude/observability}/rules/*.md` | rollup 聚出的规则，`×N` 是复现次数 |
| 先例 | `observations` 表 | 单次会话摘要，带 `session_id` 可回原始 transcript |

Full query rules: [queries.md](references/queries.md).

## Hard gates

- 先例 LIMIT ≤5 always
- Ingest via `CCOBS_SKILL_DIR` before querying very recent sessions
- Zero hits → valid "no precedent"
- 规则栏只报 `×N` 和最近日期，不加自己的评价
