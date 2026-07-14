---
name: recall
description: >-
  开工前查"过去的会话是否碰过这个问题":对 ccobs 观测账本(obs.db observations 的
  机器蒸馏 summary)做关键词/项目/时间三路检索,返回至多 5 条先例线索(每条 = 结论
  一句话 + 日期 + session 定位),不搬运原文。触发:"以前查过吗"、"有没有先例"、
  "recall <主题>"、"我是不是研究过 xxx",或查证/选型/比较/可行性这类 research 任务开工时主动跑一次。
  负例:查沉淀过的知识走 qmd(那是核实过的结论,这里是未核实的机器摘要);查持久
  事实走 auto-memory;恢复任务现场走 handoff / write-plan resume / ship Stage 0;
  要观测报告/使用统计走 ccobs——同一个 obs.db,ccobs 出报表,这里只做开工前的先例召回。
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

## 输出

    先例 · <关键词>
    - <日期> [<task_type>/<outcome>] <一句话结论> ⚠(如果超 90 天) · <sid>
    - …(≤5 条)
    结论:<有先例可续用 / 有先例但需重验 / 无先例,放心开工>

重验一条线索:按 `<sid>` 回到那次会话——`SELECT file_path FROM sessions WHERE session_id='<sid>'`
拿到原始 jsonl 路径,读它当时的真实证据,别只信 summary。

命中 0 条也是有效答案——"没查过"让开工更果断,这是本 skill 一半的价值。
