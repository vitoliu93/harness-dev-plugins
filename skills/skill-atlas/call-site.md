# call-site 审计 — 每个原子的调用点

> 一个 skill 的命运不由质量决定,由**有没有 call site** 决定:高频原子都长在某条
> 日常路径上,低频原子都在等你想起来(信 §2 接线定律)。本表一行一原子、人工维护——
> call site 是判断不是可计算属性,不塞进 build_skill_atlas.py。

三种诚实的调用点:**① workflow 的固定阶段** · **② hook/定时器** · **③ 触发词肌肉记忆**。
"description 写得好"不算 call site——它只保证被路由到,不保证被想起。
填不出 call site 的原子 = 博物馆展品:要么给它接线,要么显式豁免为"低频按需是天性"。

| 原子 | 调用点 | 类型 |
|---|---|---|
| blindspot | kox-ship Stage 1(计划前盲区扫描) | ① |
| write-plan | kox-ship 可验收计划阶段 · "写计划/plan" | ①③ |
| debrief | kox-ship finalize · "收盘/复盘/debrief" | ①③ |
| exa-code | blindspot 领域扫描 · 搜索需求(skill-guard→executor) | ①③ |
| worktree | PreToolUse worktree-guard(退出安全)· 分支约定 | ②③ |
| skill-atlas | PreToolUse skill-atlas-guard(commit 碰 SKILL.md 必先跑)· 季度搭北极星扫 staleness · "skill 体检" | ②③ |
| handoff | "handoff/交接/接手/继续 <slug>" | ③ |
| create-readable-html | "可视化/画个图/信息图"(skill-guard→executor) | ③ |
| ccobs | "观测报告/usage report" ·(debrief/skill-atlas 取使用率) | ③ |
| recall | "以前查过吗/recall/我是不是研究过" · research 开工 | ③ ⚠新增,观察触发习惯是否形成 |
| agent-reach | "YouTube 字幕/平台触达"(skill-guard→executor) | ③ 低频天性 |
| media-understanding | "转写这段音视频"(skill-guard→executor) | ③ 低频天性 |
| dispatch | "派活/dispatch" | ③ ⚠ orphan:强能力·1 次·被裸开引擎绕过 |
| cto-audit | "cto-audit/审计这个项目/项目体检"(仅用户召集)· debrief Move 3 审计信号层提醒 | ①③ ⚠新增,观察 debrief 提醒是否真发生 |
| audit-context | "audit CLAUDE/prune memory" | orphan · 月度卫生(豁免:低频天性) |
| docs-organize | "整理文档/docs organize" | orphan · 月度卫生(豁免:低频天性) |

> **skill-atlas 本轮自己上了户口**:原是 orphan,现 event 档由 `skill-atlas-guard` hook 兜底(commit 碰 SKILL.md 必先跑、过期即 deny),staleness 仍季度搭北极星——那台否决机第一次治好了自己报出的病。

## 待接线清单(类型含 ⚠ 的行)

- **dispatch** — 信 §4 的中心案例:能力很强,但 call site 只有触发词,且账本显示流量在
  裸开 dscode/arkcode 绕过它(165 会话 vs ledger 2 行)。要么把它接进某条 workflow 的
  "settled plan 后的机械批量改"阶段,要么承认触发词是它唯一的路。
- **recall** — 本次新增,call site 合法但仅 ③(触发词)。观察期:若"以前查过吗"没长成
  肌肉记忆,它就是下一个 dispatch。采纳/证伪的闸门见蓝图图纸 1(手动裸跑三次那条 SQL)。
- **cto-audit** — 2026-07-15 新增。发动权刻意只给用户(③),debrief Move 3 的审计信号层
  是它的提醒线(①)。观察期:两次收盘后看提醒是否真的触发过;若从未触发且用户也从未召集,
  按其自己的"有生有灭"律处理。

新增/改名任何原子 → 本表补一行(**接线点 = 新原子的准入证**)。空格子就是待接线清单。
