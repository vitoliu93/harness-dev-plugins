---
name: take-over
description: >-
  Continue an interrupted agent task by locating the session and reading goal, boundary, and progress.
  Use when the user says take over/接手/continue <session>, or handoff/save progress to shared tmp.
argument-hint: "[session-id | 任务关键词 | IJxxxx]"
metadata:
  kind: sop
---

# take-over

Transcript is the handoff; ccobs is the index. Locate, read, continue.

Full flow: [workflow.md](references/workflow.md).

## Hard gates

- Observations.summary is clue only — verify transcript + git.
- Every user correction from transcript goes in the brief.
- Plan dir present → defer to advanced-plan resume.
