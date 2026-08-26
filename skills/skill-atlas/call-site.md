# call-site 审计

一个 skill 的命运由**有没有 call site** 决定。三种调用点:① workflow 固定阶段 · ② hook/定时器 · ③ 触发词肌肉记忆。
"description 写得好"不算 call site。

形态:**meta** · **atom** · **sop** — 见 skill-forge。

| 原子 | 形态 | 调用点 | 类型 |
|---|---|---|---|
| advanced-plan | sop | ship(kox) 计划阶段 · "写计划/plan" | ①③ |
| debrief | meta | ship(kox) finalize · "收盘/复盘/debrief" | ①③ |
| exa-code | atom | grill-me 盲区扫描 · 搜索需求(skill-guard→executor) | ①③ |
| skill-atlas | meta | skill-atlas-guard(commit 碰 skills/) · "skill 体检" | ②③ |
| take-over | sop | "接手/take over/继续 <session>" · handoff/save | ③ |
| ccobs | meta | "观测报告/usage report" · debrief/skill-atlas 取使用率 | ③ |
| recall | meta | "以前查过吗/recall" · research 开工 | ③ |
| media-understanding | atom | 本地音视频/录屏(skill-guard→executor) | ③ |
| use-agents | sop | "启动 agent/模型渠道/配置在哪" · orchestrate 下游 | ①③ |
| orchestrate | sop | "编排角色/fan out/advisor+programmer+audit" · 模型主动(准备多角色协作前) | ①③ |
| cto-audit | meta | /cto-audit · debrief 审计信号提醒 | ①③ |
| grill-me | atom | advanced-plan new · ship Stage 2 · "grill me/盘问/blindspot" | ①③ |
| skill-forge | meta | debrief 候选毕业 · "铸造/建 skill" | ①③ |
| skill-style-review | atom | skill-forge ship · skill-atlas semantic style | ① |
| resume-learning | sop | "存档/读档/继续 <学习主题>" | ③ |
| study-coach | atom | 目标审计/迷茫/盘点/出题/垫脚石 | ③ |
| use-html | atom | 可视化(skill-guard→executor) · 原型:advanced-plan/ship(kox) · kox ship checkpoint | ①③ |
| no-ai-slop | atom | 收尾汇报 · "汇报/说人话/去 AI 味" | ②③ |
| context-audit | meta | "audit CLAUDE/整理文档" | orphan · 月度卫生(豁免) |
| doc-claim-verify | sop | "核验/实证文档声明·文档还准不准" · cto-audit/debrief 文档取证 | ③ |
| visual-evidence | sop | orchestrate UI-facing 验证 lane · "UI 验收/界面取证" | ①③ |
| ceo-mode | sop | "你是 CEO/我是董事长/全权自主/只负责调度" · orchestrate 上游(拿到全权授权时) | ③ |

新增/改名原子 → 本表补一行。填不出 call site → 别 ship 或显式豁免低频按需。

## 待接线(⚠)

- **orchestrate** — 观察角色卡、Herdr tab 收尾和 agent 交接是否稳定
- **use-agents** — 观察个人渠道配置与配额记录是否足够简单
- **recall** — 仅触发词;观察"以前查过吗"是否长成肌肉记忆
- **use-html 原型模式** — 非 S 的 UI 任务走完计划却没有 prototype.html → 闸门位置错
- **cto-audit** — debrief 提醒是否真触发
- **ceo-mode** — 仅触发词;观察全权授权后是否真的零自己动手、汇报是否稳定收敛到三段
- **doc-claim-verify** — 仅触发词;观察 cto-audit / debrief 是否该固定接一段文档取证
- **resume-learning vs take-over/advanced-plan** — 裸"继续"争路由;收紧到"读档"

## 已归档

- **worktree** — 约定内联 advanced-plan;`worktree-guard` hook 仍在
