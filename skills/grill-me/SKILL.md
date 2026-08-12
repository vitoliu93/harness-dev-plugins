---
name: grill-me
description: >-
  Build a decision tree and escalate only high-risk choices one at a time with recommendations.
  Use before substantive work when direction is unclear, or the user says grill me/盘问我/blindspot.
metadata:
  kind: atom
---

# grill-me

## 0. 事实/决策二分

环境里查得到的(代码/git/文档/工具输出)自己查,永不上呈。只有真判断题进树。

## 0.5 盲区扫描(可选)

领地生疏时(叫不出受影响文件名 / 任务倚仗仓外领域知识 / 用户点名 blindspot),
建树前先扫 unknown unknowns——用户想不到要问的坑、prior art、"好"长什么样。
盘问只能覆盖想得到的分支;扫描负责想不到的。

- 先用一句话框定已知事实、要扫的 repo/domain lens，并按用户已说明的经验校准范围。
- 主上下文只编排,原始 dump 不进来。一条消息并行 spawn:**repo lens** 每模块一个
  `dev-kit:code-search` agent(报 conventions / 隐藏耦合 / prior art / git 史雷区,cite file:line);
  **domain lens** 每主题一个 `general-skills-executor`(model: sonnet)跑 exa-code
  (报非专家想不到的 pitfalls / spec 约束 / 质量天花板,digest + sources)。
  domain lens 只在任务真依赖仓外知识时才开。
- 合并成 **5-10 条**简报,只收用户 prompt 里没有的,按"猜错的代价"排序:
  改数据模型/架构的约束 > 改整个方案的 prior art > 违反即返工的惯例 > 小 gotcha。
  格式:一行一条 `[repo|domain]` **你不知道的那件事** — 为什么它会改变计划。
- 简报喂进决策树(它常常直接新增/剪掉分支);用户单独喊 /blindspot 时,交付简报即止,
  不追访谈——等用户反应再进盘问。

## 1. 建决策树

列出任务里所有待决事项,按依赖序排:父决策先问,子决策挂在分支上。

## 2. 分层 — 本 skill 的核心

**CEO 层(升级,逐个问)**:

- 破坏性/不可逆:删数据、改共享历史、动生产、对外发布或发消息
- 项目稳定性:核心链路、基建、安全边界、依赖大版本
- 功能大变化:用户可见行为、范围增减、方向调整
- 花钱/配额/对外承诺

**CTO 层(自决+公示)**:实现细节、命名、同级等价库选型(牵动依赖大版本的
除外,那是上面的稳定性项)、内部结构、测试策略。

Litmus:这个选错了,CEO 一周后会发现并在乎吗?会 → 升级。
全树无 CEO 层决策 → 说一句"无需拍板",直接给公示清单开工——不为盘问而盘问。

## 3. 走树

- CTO 层:当场决,一行一条记入公示清单。
- CEO 层:一次一问(多问齐发令人眼花),推荐答案 + 一句人话理由——按
  `no-ai-slop` 汇报模式口径,用结果/风险语言,代码细节不进问题;等答复再问下一个;每个答案都可能
  剪掉后续分支,剪完重排再继续。

## 4. 收口

CEO 层全部确认才动手(硬门)。产出两份:**已确认决策**与**自决公示清单**——
有 advanced-plan 的,前者进 goal.md(它锁用户意图),后者进 spec.md(实现选择
不进 goal.md,是 advanced-plan 自己的规矩);没有的,两份都贴任务正文。
