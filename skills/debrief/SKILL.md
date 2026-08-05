---
name: debrief
description: >-
  Archive plan artifacts, distill one lifecycle memory, and surface skill candidates.
  Use when a task/issue wraps up, after merge/deploy, or the user says 收盘/复盘/debrief.
argument-hint: "[optional: task slug or一句话说明收的是哪个盘]"
metadata:
  kind: meta
---

# debrief

Three independent moves from this session + git diff + plan dir. Each skippable; "nothing to sediment" is valid.
Never interview the user — you were there.

## Moves

1. **Archive** plan dir → `_archive/` ([moves.md](references/moves.md) §1)
2. **Distill** ≤1 lifecycle memory ([moves.md](references/moves.md) §2)
3. **Promote** skill candidates + harness drift + cto-audit signal ([moves.md](references/moves.md) §3)

## Output

```
收盘 · <slug>
归档: <path | skipped>
记忆: <file + type | nothing>
技能: <candidate/drift | no deltas>
```
