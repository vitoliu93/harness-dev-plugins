---
name: recall
description: >-
  Search ccobs for up to five past-session clues on a topic without quoting transcripts.
  Use before research or implementation when checking whether this was investigated before.
argument-hint: "[主题关键词]"
metadata:
  kind: meta
---

# recall

**Recall is suspicion** — summary is clue, not fact. Re-verify before code or reports.

Full query rules: [queries.md](references/queries.md).

## Hard gates

- LIMIT ≤5 always
- Ingest via `CCOBS_SKILL_DIR` before querying very recent sessions
- Zero hits → valid "no precedent"
