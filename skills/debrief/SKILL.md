---
name: debrief
description: >-
  Archive plan artifacts, distill this session into ccobs, correct a rule that proved wrong, then improve, merge, or retire existing skills before registering any new candidate.
  Use when a task/issue wraps up, after merge/deploy, or the user says 收盘/复盘/debrief.
argument-hint: "[optional: task slug or一句话说明收的是哪个盘]"
metadata:
  kind: meta
---

# debrief

Three independent moves from this session + git diff + plan dir. Each skippable; "nothing to sediment" is valid.
Never interview the user — you were there.

## Audit first — delegate, blind

Before the moves, dispatch an **independent auditor** over the session transcript
(`~/.claude/projects/<project>/<session-id>.jsonl`) for obstacles, rework, and
orchestration/tooling optimizations.

- Prefer a herdr vendor (`HERDR_ENV=1`, strong slot per manifest); fallback: subagent.
- Host writes **questions only** — no self-narrative, no known-issue anchors, no sampling hints.
- Auditor is read-only; report to a file. Findings feed Moves 2–3.
- Trivial session (no delegation, <30min) → skip, self-debrief.

## Moves

1. **Archive** plan dir → `_archive/` ([moves.md](references/moves.md) §1)
2. **Sediment** 立刻蒸馏本会话 + 至多纠正一条被打脸的规则 ([moves.md](references/moves.md) §2)
3. **Promote** improve / merge / retire existing skills first, new candidate last + harness drift + cto-audit signal ([moves.md](references/moves.md) §3)

## Output

```
收盘 · <slug>
归档: <path | skipped>
沉淀: <蒸馏 ok | failed> · <改了哪条规则 | 无需纠正>
技能: <优化 X | 合并 X+Y | 拟移除 Z | 新候选 | no deltas>
```
