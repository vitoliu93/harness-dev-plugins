# Debrief moves — archive, memory, promotion

## Move 1 — Archive

When `docs/advanced-plans/<date>-<slug>/` belongs to this task:

1. Fill `review.md` if still template (3–6 process bullets). Already filled → skip.
2. Set `todo.md` Current State to `Status: closed`.
3. Move to `docs/advanced-plans/_archive/<date>-<slug>/`; commit `chore(<slug>): archive plan`.
   Multi-repo workspace root → move only, no commit.

No plan dir → skip silently.

## Move 2 — Sediment into ccobs

不写记忆 md。这个会话已经被 ccobs 观测下来了，收盘只做两件事。

### 2a 立刻蒸馏本会话

平时要等 launchd 那一轮（每小时，且 distill 至少滞后 30 分钟）。收盘时手动提前，
这样今天的规则今晚就能用上：

```bash
CCOBS_SKILL_DIR="<absolute path of the directory containing the loaded ccobs/SKILL.md>";
bun "$CCOBS_SKILL_DIR/scripts/ingest.ts"
bun "$CCOBS_SKILL_DIR/scripts/distill.ts" --session "<this session id>"
bun "$CCOBS_SKILL_DIR/scripts/rollup.ts"
```

三条分开跑：前一条失败后面不会执行。任一条失败就说一句，不要重试到底。

### 2b 纠正被打脸的规则

开场注入的规则你带着干了一整天。回头只问一句：**有没有哪条照着做反而错了。**

有就直接编辑 `${CCOBS_DIR:-$HOME/.claude/observability}/rules/<project-key>.md`：

- 整条是错的 → 删掉那一行
- 半对 → 就地改写成对的说法，**行尾的 `×N (最近 日期)` 要保留**，丢了就会被当成 ×1，沉到底再也注入不到

`<project-key>` 是 cwd 里的 `/` 换成 `-`；worktree 折算到主项目。跨项目的规则在 `_global.md`。

规矩：

- 一次收盘最多改一条。没有就跳过，这是常态。
- 只改 rollup 出的摘要文件。`observations` 是可重建的派生表，`sessions` 和原始 jsonl 是只读真源，都不动。
- 那几条观测本身没记错——它们如实记下了当时确实这么以为。错的是聚出来的结论。
- 删掉的行不会被灌回来：rollup 只处理水位线之后的新会话。除非新会话又提出同一条，那说明这事今天还在发生，该回来。
- 规则「旧」不用管：rollup 按次数和最近日期排，没人再提的自己沉底。debrief 只管「错」。

改错了可以回滚：`rules/.bak/` 留了最近 5 份带时间戳的备份。

## Move 3 — Promote

The skill library is maintained, not only grown. After reviewing the session, walk
(a)→(d) in order and stop at the first that holds.

### (a) Improve an existing skill

Test: the pattern falls inside some existing skill's `description` trigger range →
edit that skill, register nothing.

### (b) Merge skills or candidates

Test: two skills (or a skill and a candidate) share half or more of their trigger
words or steps → merge them into one.

### (c) Propose removal

Test: no ccobs usage in the last 30 days, or another skill covers it completely →
propose removal; only act after the user agrees.

```bash
sqlite3 ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db \
  "SELECT COUNT(*) c, MAX(ts) last_used FROM tool_calls
   WHERE tool IN ('Skill','SlashCommand') AND skill LIKE '%<skill-name>'
     AND ts >= datetime('now','-30 days')"
```

`skill` is stored namespaced (`dev-kit:debrief`), so match with `LIKE '%<name>'`.
`c=0` → removal candidate.

### (d) Register a new candidate

Only when (a)(b)(c) all fail. Track in
`${CCOBS_DIR:-$HOME/.claude/observability}/SKILL-CANDIDATES.md`.
Same-session repeats ≥2 count strongly. Cross-check ccobs `sop_candidate` when available:

```bash
sqlite3 ${CCOBS_DIR:-$HOME/.claude/observability}/obs.db \
  "SELECT sop_candidate, COUNT(*) c FROM observations WHERE sop_candidate IS NOT NULL GROUP BY sop_candidate HAVING c>=2"
```

A candidate at **seen ≥ 3** → run (a) and (b) against it once more; still nothing →
propose `skill-forge` (ask user). Apply near-neighbor + boundary tests before proposing.

### Harness drift

Fix stale paths, wrong assumptions, missing hooks/templates in the harness repo when fresh.
For agent routes, inspect `${CCOBS_DIR:-$HOME/.claude/observability}/agents/quota.json` for stale reset records.

For compaction: read `${CCOBS_DIR:-$HOME/.claude/observability}/compaction.jsonl` for this session.
Repeated `dropped` anchors (参考真源, prototype.html, done criteria) → fix plan-anchor / goal.md anchors, not longer summaries.

### Audit signal

Append「建议召集 cto-audit:<原因>」when either hits:
- Same structural theme ≥3× in LEARNED.md / SKILL-CANDIDATES.md
- `docs/audit/` constitution stale or recurring bugs hit existing rules

Otherwise skip.
