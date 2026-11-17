# call-site 审计

一个 skill 的命运由**有没有 call site** 决定。三种调用点:① workflow 固定阶段 · ② hook/定时器 · ③ 触发词肌肉记忆。
"description 写得好"不算 call site。

形态:**meta** · **atom** · **sop** — 见 skill-forge。

| 原子 | 形态 | 调用点 | 类型 |
|---|---|---|---|
| advanced-plan | sop | ship(kox) 计划阶段 · "写计划/plan" | ①③ |
| debrief | meta | ship(kox) finalize · "收盘/复盘/debrief" | ①③ |
| ccobs | meta | "观测报告/usage report" · debrief/skill-forge 取使用率 | ③ |
| use-agents | sop | "启动 agent/模型渠道/配置在哪" · orchestrate 下游 | ①③ |
| orchestrate | sop | "编排角色/fan out/advisor+programmer+audit/独立复核" · 模型主动(准备多角色协作或运行行为改动验收前) | ①③ |
| grill-me | atom | advanced-plan new · ship Stage 2 · "grill me/盘问/blindspot" | ①③ |
| skill-forge | meta | debrief 候选毕业 · "铸造/建 skill" · skill-atlas-guard(commit 碰 skills/) · "skill 体检/review" | ①②③ |
| teach-me | atom | "teach me/教我/讲讲 <topic>" · 看文档卡在某概念 | ③ |
| use-html | atom | 看懂概念/仓库/流程/文档 · 复盘/汇报 · 模型主动(图比文字讲得清时) | ①③ |
| context-audit | meta | "audit CLAUDE/整理文档" | orphan · 月度卫生(豁免) |
| self-profile | sop | /self-profile · 定时自我复盘(月度) | ②③ |
| ceo-mode | sop | "你是 CEO/我是董事长/全权自主/只负责调度" · orchestrate 上游(拿到全权授权时) | ③ |

新增/改名原子 → 本表补一行。填不出 call site → 别 ship 或显式豁免低频按需。

## 待接线(⚠)

- **orchestrate** — 观察角色卡、Herdr tab 收尾和 agent 交接是否稳定
- **use-agents** — 观察个人渠道配置与配额记录是否足够简单
- **ceo-mode** — 仅触发词;观察全权授权后是否真的零自己动手、汇报是否稳定收敛到三段

## 已归档

- **doc-claim-verify** — 文档核验走独立评审的任务卡
- **skill-review** — 体检走 skill-forge 的 Fleet check
- **skill-style-review** — 语义评审走 `skill-forge/scripts/style_review.ts`
- **worktree** — 约定在 advanced-plan;退出顺序由 `worktree-guard` hook 拦
- **recall** — 先例查询走 `recall-precedent` hook
- **resume-learning** · **cto-audit** · **visual-evidence** — 无替代,按需手做
- **take-over** · **rate-limit-watcher** — 会话接续和限额恢复走客户端自带功能
