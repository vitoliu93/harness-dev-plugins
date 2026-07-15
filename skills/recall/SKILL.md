---
name: recall
description: >-
  开工前查先例:检索 ccobs 观测账本,返回至多 5 条"过去会话碰过这个问题"的
  线索,不搬运原文。Use when "以前查过吗/有没有先例/recall <主题>",
  或 research 任务开工时主动跑一次。
argument-hint: "[主题关键词]"
---

# recall

一条铁律贯穿:**召回即怀疑。** observations.summary 是机器蒸馏的"当时看起来的
结论",不是核实过的事实——线索用来避免重复劳动,不用来直接引用。任何要写进代码
或报告的结论,先按线索找到当时那次会话的证据重验一遍。

## 检索(sqlite3 直查,不建新基建)

一条 LIKE 查询,LIMIT 永远 ≤5。列已按 2026-07-14 多源化后的 schema 核过并跑通——
`started_at`/`project` 在 sessions,`task_type`/`outcome`/`summary` 在 observations,
故列全部限定表名、JOIN on session_id(schema 会漂;列名对不上时先 `.schema observations`
`.schema sessions` 复核):

    sqlite3 -header ~/.claude/observability/obs.db \
      "SELECT date(s.started_at) d, o.task_type, o.outcome, substr(o.summary,1,120) s, s.session_id sid
       FROM observations o JOIN sessions s USING(session_id)
       WHERE o.summary LIKE '%<关键词>%'
       ORDER BY s.started_at DESC LIMIT 5"

- **关键词**:主题的中英两种写法都试(蒸馏语言不定)。
- **项目**:加 `AND s.project LIKE '%<repo>%'` 缩到当前仓。
- **时间**:近因优先已由 ORDER BY 保证;结果里 >90 天的行标 ⚠(今天日期在上下文里,
  自己比一下即可)。
- **覆盖(决定"无先例"可不可信)**:observations 全是 main 会话;claude-code 持续蒸馏,
  codex/droid/grok/opencode 只是 2026-07-13 的一次性回填(ccobs 自动蒸馏仅 cc),之后的
  非-cc 会话不入库。故不按 source 过滤(回填先例照样有用),但"无先例"对非-cc 工作是弱
  信号——可能只是没蒸馏,不是没发生。库不存在(没装 ccobs/没首次灌库)也按无先例处理,别报错。
- **很近的会话查不到**:今天刚结束、还没到下个整点的会话可能尚未灌库。查这类先例前先跑
  一次增量灌库(安全幂等秒级),再查:`bun ${CLAUDE_PLUGIN_ROOT}/skills/ccobs/scripts/ingest.ts`
  (载入本 skill 时 `${CLAUDE_PLUGIN_ROOT}` 已替换成字面路径)。注意:灌库只补事实层,
  observations 蒸馏仍等 launchd 夜跑——刚结束的会话能查到 session 元数据,但 summary 可能还没有。

## 输出

    先例 · <关键词>
    - <日期> [<task_type>/<outcome>] <一句话结论> ⚠(如果超 90 天) · <sid>
    - …(≤5 条)
    结论:<有先例可续用 / 有先例但需重验 / 无先例,放心开工>

重验一条线索:按 `<sid>` 回到那次会话——`SELECT file_path FROM sessions WHERE session_id='<sid>'`
拿到原始 jsonl 路径,读它当时的真实证据,别只信 summary。

命中 0 条也是有效答案——"没查过"让开工更果断,这是本 skill 一半的价值。
