---
name: cto-audit
description: >-
  Audit project architecture, domain model, and harness rules from a CTO lens.
  Use when the user invokes /cto-audit or requests a structural governance audit.
disable-model-invocation: true
argument-hint: "[目标项目目录] [engineering|algorithm|delivery]"
metadata:
  kind: meta
---

# CTO 项目技术审计

Ask each cycle: after this change, are architecture, domain model, and rule boundaries converging or drifting?

Full process: [process.md](references/process.md). Subagent prompts: [subagent-prompts.md](references/subagent-prompts.md). Report: [report-template.md](references/report-template.md).

## Hard gates

- Scoped audit still runs Phase 0–1 unless user-approved downgrade (state in report).
- Output is harness patches, not just narrative.
- Report must include 规则变更公示 and 值得肯定.
- Do not upgrade to full audit mid-session without user.
