---
name: debrief
description: >-
  收盘 sedimentation after a unit of work: archive the task's plan artifacts,
  distill at most ONE lifecycle-tagged memory, and promote recurring patterns
  into skill candidates. Use when a task/issue/plan wraps up, after merge or
  deploy, or when the user says "收盘", "复盘", "debrief", "settle", "沉淀一下".
  Works standalone on any session — project ship SOPs chain it as their final stage.
argument-hint: "[optional: task slug or一句话说明收的是哪个盘]"
---

# debrief

Code sediments in git; knowledge evaporates unless you catch it now. The session
log already holds everything that happened — debrief builds three small
projections of it. Each move is independent, idempotent, and skippable; an
honest "nothing to sediment" is a valid outcome for any of them.

Source material: the current conversation, the task's git diff/commits, and the
plan dir if one exists. Never interview the user about what happened — you were
there.

## Move 1 — Archive(归档)

Only when a `docs/advanced-plans/<date>-<slug>/` dir belongs to this task:

1. Full-tier plan and `review.md` is missing or still template placeholders →
   fill it: 3–6 honest bullets on the agent×user process (what caused rework,
   what to do differently), not a diary. Already filled (e.g. advanced-plan's
   `review` command ran first) → leave it alone, say so.
2. Set `todo.md` Current State to `Status: closed`.
3. Move the dir to `docs/advanced-plans/_archive/<date>-<slug>/` and commit on
   the task branch: `chore(<slug>): archive plan`. Multi-repo workspace plan
   (dir lives in a non-git workspace root, per advanced-plan's Location rule) →
   same move, no commit.

No plan dir → skip, say nothing.

## Move 2 — Distill(记忆蒸馏)

Write **at most one** memory file per task into the project's auto-memory
(`~/.claude/projects/<project>/memory/`). Litmus first: *would next-session-me
err without this?* Repo already records it (code, git history, CLAUDE.md, the
plan dir you just archived) → don't duplicate. Nothing passes → say "nothing to
sediment" and move on.

Classify what survived:

| type | what it is |
|---|---|
| `feedback` | user correction on how to work — include **Why** + **How to apply** |
| `decision` | architecture/tradeoff rationale — chose X over Z because Y |
| `postmortem` | incident root-cause — MUST carry a live `status:` |
| `reference` | stable external fact (ID, URL, command) |

Frontmatter contract — the two new fields nest inside the existing `metadata:`
block, and the classification above goes in `metadata.type` (adding `decision`
and `postmortem` to the standard set):

```yaml
---
name: kox-render-manifest-postmortem
description: <one-line hook used for recall relevance>
metadata:
  type: postmortem            # feedback | decision | postmortem | reference
  status: active              # active | superseded | resolved — postmortem/decision only
  updated: 2026-07-02         # bump whenever status changes
---
```

Before writing: search existing memories for the same subject. Prefer
**updating** an old entry (fix its `status`, e.g. a "生产待发" postmortem whose
fix has now shipped → `resolved`) over adding a near-duplicate. Update the
`MEMORY.md` index line: `- [Title](file.md) — hook (status)` — the `(status)`
suffix only for postmortem/decision entries, omitted for the rest.

## Move 3 — Promote(技能固化)

Three checks against this task's experience:

1. **Recurrence** — did we hand-do something for roughly the third time across
   sessions? Track candidates in `<memory-dir>/SKILL-CANDIDATES.md`:

   ```markdown
   | candidate | seen | sessions/notes | sketch |
   |---|---|---|---|
   | volc-cr-image-cleanup | 2 | 2026-06-21, 2026-07-02 | wrap crctl 三连 into one skill |
   ```

   New pattern → add a row with `seen: 1`. Existing row → increment, unless
   today's date is already in its notes column (a re-run of debrief for the
   same task must not double-count). A row reaching **3** → propose invoking
   `skill-forge` to author it (ask the user; never auto-create).

   **Same-session recurrence counts too.** The same-date rule dedupes *re-runs
   of debrief*, not repeats inside one long session. Hand-doing the same thing
   ≥2 times within a session — re-deriving the same env vars, re-fixing one
   class of error across three deploys, the same gate returning a false verdict
   twice — is the strongest fixation signal there is. Count `seen +1`, note
   `<date>×N (same session)`.

   Cross-session 兜底 — memory 计数只覆盖跑过 debrief 的 session;ccobs 蒸馏层
   全量标注 `sop_candidate`(可复现流程),收盘时顺手对账:

   ```bash
   sqlite3 ~/.claude/observability/obs.db "SELECT sop_candidate, COUNT(*) c
     FROM observations WHERE sop_candidate IS NOT NULL
     GROUP BY sop_candidate HAVING c>=2 ORDER BY c DESC"
   ```

   命中主题不在 SKILL-CANDIDATES → 补行,seen 取该计数。没装 ccobs / 查不到 → 跳过。

   Graduation conditions (skill-forge's qualification gate — apply before proposing):
   - **Near-neighbor rule**: draft the candidate's one-line `description:`
     first; if it isn't clearly distinguishable from an existing skill's
     description, fold the pattern into that skill instead of creating one.
   - **Boundary test**: a pattern graduates only if it also names a boundary
     or cost ("use for X, NOT for Y") — recurrence count alone isn't enough.
   - On promotion, record a 3-line **eval-delta** in the candidate row:
     before-description → after-description → what route confusion it fixes.

2. **Harness drift** — did anything in the harness mislead us this task (stale
   path, wrong assumption, missing branch)? Propose the one-line fix now, while
   the failure is fresh. Its own repo (e.g. agent-plugins) → offer to edit
   directly; npx-managed → note it in the memory from Move 2 instead.
   The surface is wider than SKILL.md: **a plan/goal template that had no slot
   for the thing that went wrong, a `/goal` condition the judge could satisfy
   without the work being done, or a hook that never fired** are the same class
   of defect and the same fix — they just don't look like skills.

   Special case when this task used `dispatch-vendors`: read
   `~/.claude/dispatch/ledger.md` and check the result column — **split by the
   `why:` column first**: `why:obs` rows were dispatched under the economics
   floor on purpose (the user's standing observation directive) and must not be
   scored against the gate; only `why:econ` rows judge it (rows with no `why:`
   predate 2026-07-25 — read them as `econ`). Mostly
   pass with few fixups/resumes → healthy. Repeated fail or pass-with-fixups
   → the dispatched tasks carry more judgment or context than the gate
   admits; propose tightening dispatch-vendors' gate or scenario catalog as
   the drift fix. The ledger only records dispatches that happened, so also
   ask the survivorship question: **did dispatching stop partway through the
   task?** If yes, name why (nature of the work changed / not worth it /
   forgot) — an all-`pass` ledger over a collapsed second half reads as
   "healthy" and isn't.

   Special case when the session got compacted: the `compact-audit` hook logs
   每次压缩丢了哪些计划锚点 —— 收盘时读一眼本 session 的行：

   ```bash
   grep '"<session-id>"' ~/.claude/observability/compaction.jsonl \
     | python3 -c "import json,sys; [print(r['ts'], p['dropped']) for l in sys.stdin
       for r in [json.loads(l)] for p in r['plans']]"
   ```

   同一个锚点(参考真源路径、prototype.html、完成判据里的 ident)**连续多次
   `dropped`** = 它已经不在工作上下文里了,后半程的判断都是在没有它的情况下做的
   —— 这正是 1.4 剪辑器那次的失效路径(8 次压缩,原型路径 0 次幸存)。修法不是
   写更长的摘要,是让锚点有个压缩之外的落点(plan-anchor hook / goal.md 的
   `参考真源` 段)。没装 ccobs 目录 / 无该 session 行 → 跳过。

3. **审计信号**(cto-audit 的信号层——只提醒,不发动):两个便宜指标,任一命中
   就在收盘报告末尾加一句「建议召集 cto-audit:<原因>」:
   - 本项目 LEARNED.md / SKILL-CANDIDATES.md 里同一结构性主题(分层/重复实现/
     临时兼容/概念混名)第 ≥3 次出现;
   - 项目有 `docs/audit/` 但最新宪法断言已超过一季未动,或复发 bug 主题命中
     其某条已立规则(守卫可能已烂)。
   两项都不命中 → 跳过,不产生输出。

## Output

End with a compact 收盘报告:

```
收盘 · <slug or one-liner>
归档: <path | skipped>
记忆: <file written/updated + type + status | nothing to sediment>
技能: <candidate ±1 / drift fix proposed | no deltas>
```
