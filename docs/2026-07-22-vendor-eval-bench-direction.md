# 方向 · Vendor 评测 Bench

> 2026-07-22 定向。现在不建,先攒题——这是一份方向共识,不是待办。

## 为什么

vendor pick 与 delegation gate 目前靠经验口径(quota 大小、模型档位、视觉能力)。
口径会漂移,评测才能站稳:要有一个 vendor evaluation bench,用**真实 coding +
agentic 任务**量化各 vendor(dscode / arkcode / kicode / cursor-agent 各模型档)的
实际表现,让路由决策有数据支撑。

## 怎么攒(日常收集,不专门立项)

- 素材池就是现有台账:dispatch ledger(`~/.claude/dispatch/ledger.md`)+ ccobs
  会话历史。它们本来就在记录每次派单。
- 入选标准:**派过、验收过、结果可判定**的真实任务。routing review / 收盘
  (debrief)时顺带标记为 bench 候选,不新增任何机制。
- 攒到十几条可判定真题,再立项建 bench,水到渠成。

## 存储边界

**bench 属用户级资产,放 `~/.claude/` 下(如 `~/.claude/dispatch/bench/`),
不进本 skill 公开仓。** 本文档只记方向;题目、判分、成绩单都留在用户侧。

## 现状(2026-07-22 口径,bench 未来校准的对象)

| 档位 | 首选 | 备胎 |
|---|---|---|
| 重任务 | cursor-agent `cursor-grok-4.5-high`(composer-2.5 带 subagent) | — |
| 快/轻任务 | cursor composer-2.5 直派(视觉优势) | dscode |
| 多样性红队 / 1M ctx | kicode(quota 紧,省着用) | — |
| GPT 家族需要时 | `gpt-5.6-sol-high`(不用 5.5) | — |
