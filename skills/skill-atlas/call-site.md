# call-site 审计 — 每个原子的调用点

> 一个 skill 的命运不由质量决定,由**有没有 call site** 决定:高频原子都长在某条
> 日常路径上,低频原子都在等你想起来(信 §2 接线定律)。本表一行一原子、人工维护——
> call site 是判断不是可计算属性,不塞进 build_skill_atlas.py。

三种诚实的调用点:**① workflow 的固定阶段** · **② hook/定时器** · **③ 触发词肌肉记忆**。
"description 写得好"不算 call site——它只保证被路由到,不保证被想起。
填不出 call site 的原子 = 博物馆展品:要么给它接线,要么显式豁免为"低频按需是天性"。

形态列:**meta**(管技能系统本身)· **atom**(单能力,可被组合技能链到,通常
model-invoked)· **sop**(固化流程,通常 user-invoked)——形态定 invocation
默认,见 skill-forge §2。

| 原子 | 形态 | 调用点 | 类型 |
|---|---|---|---|
| blindspot | atom | ship(kox) Stage 1(计划前盲区扫描) | ① |
| advanced-plan | sop | ship(kox) 可验收计划阶段 · "写计划/plan" | ①③ |
| debrief | meta | ship(kox) finalize · "收盘/复盘/debrief" | ①③ |
| exa-code | atom | blindspot 领域扫描 · 搜索需求(skill-guard→executor) | ①③ |
| worktree | atom | PreToolUse worktree-guard(退出安全)· 分支约定 | ②③ |
| skill-atlas | meta | PreToolUse skill-atlas-guard(commit 碰 SKILL.md 必先跑)· 季度搭北极星扫 staleness · "skill 体检" | ②③ |
| handoff | atom | "handoff/交接/接手/继续 <slug>" | ③ |
| create-readable-html | atom | "可视化/画个图/信息图"(skill-guard→executor) | ③ |
| ccobs | atom | "观测报告/usage report" ·(debrief/skill-atlas 取使用率) | ③ |
| recall | atom | "以前查过吗/recall/我是不是研究过" · research 开工 | ③ ⚠新增,观察触发习惯是否形成 |
| agent-reach | atom | "YouTube 字幕/平台触达"(skill-guard→executor) | ③ 低频天性 |
| media-understanding | atom | "转写这段音视频"(skill-guard→executor) | ③ 低频天性 |
| dispatch-vendors | sop | "派给 vendor/让 cursor 跑/后台跑" · 模型主动(独立侧枝任务/模型多样性机会) · advanced-plan 路由 ② · orchestrate 传输层下游 ① | ①③ ⚠ 2026-07-16 重定位(原 dispatch 廉价打字员定位六周仅 3 用),观察期至 08-16 |
| orchestrate | sop | "委派/编排/派活/适合委派吗/spec pack" · 模型主动(准备 fan out 编码工作前) · 传输链到 dispatch-vendors | ①③ ⚠ 2026-07-24 新增(消化自三方编排设计文档),观察期:先行件(pre-red gate/receipt/账本)未建前是纯纪律层 |
| cto-audit | sop | 用户输入 /cto-audit(`disable-model-invocation` 已把"仅用户召集"机械化)· debrief Move 3 审计信号层提醒 | ①③ ⚠观察 debrief 提醒是否真发生 |
| grill-me | atom | blindspot 收尾链下一步 · advanced-plan `new` 步骤 1 点名 · ship(kox) Stage 2 · "grill me/盘问我/要我拍板的" | ①③ |
| plan-prototype | atom | advanced-plan `new` 步骤 7(full 档有参考真源 / 任何 UI 改动)· ship(kox) Stage 2 的用户层产出 · "目标原型/先给我看看你要做成什么样" | ①③ ⚠ 2026-07-25 新增(消化自 1.4 剪辑器复盘:验收口径缺保真轴),观察期至 08-25 |
| skill-forge | meta | debrief Move 3 候选满 3 毕业 · "铸造/建个 skill" | ①③ ⚠新增(消化自 yao-meta-skill,vendored 工具链供 skill-atlas) |
| report | atom | 收尾汇报前必载(CLAUDE.md 指路)· "汇报/report" | ②③ |
| audit-context | sop | "audit CLAUDE/prune memory" | orphan · 月度卫生(豁免:低频天性) |
| docs-organize | sop | "整理文档/docs organize" | orphan · 月度卫生(豁免:低频天性) |

> **skill-atlas 本轮自己上了户口**:原是 orphan,现 event 档由 `skill-atlas-guard` hook 兜底(commit 碰 SKILL.md 必先跑、过期即 deny),staleness 仍季度搭北极星——那台否决机第一次治好了自己报出的病。

## 待接线清单(类型含 ⚠ 的行)

- **orchestrate** — 2026-07-24 新增,操作化 `docs/2026-07-23-coding-agent-orchestration-design.md`。
  当前是纯纪律层(路由判定/spec 模板/门时序可即用);pre-red gate 脚本、run_receipt
  validator、job_ledger(ccobs 扩表)是设计文档 §7 的先行件,建成后回填本 skill 的
  scripts/。观察期:若委派场景仍全部裸走 dispatch-vendors 而不过资格门,说明纪律层
  没被想起,按 debrief Move 3 处理。

- **dispatch-vendors** — 原 dispatch("廉价打字员"定位)被两侧夹死:委派走 subagent/
  Workflow,便宜引擎被裸开(141 会话 vs 中转 ~11 次)。2026-07-16 重定位为"整块独立任务
  派给 vendor CLI"(D 多样性/Q 配额/I 索引三闸门),触发改为模型主动。观察期至 08-16:
  若真实派活仍 <5 次,按 debrief Move 3 走 archive。
- **recall** — 本次新增,call site 合法但仅 ③(触发词)。观察期:若"以前查过吗"没长成
  肌肉记忆,它就是下一个旧 dispatch(廉价打字员版的命运)。采纳/证伪的闸门见蓝图图纸 1(手动裸跑三次那条 SQL)。
- **plan-prototype** — 2026-07-25 新增。call site 是 ①(advanced-plan/ship 的计划阶段固定步骤),
  不靠触发词兜底。观察期至 08-25 的证伪条件很硬:**非 S 的 UI 任务走完计划却没有
  `prototype.html`**,说明步骤 7 被跳过 → 那就不是技能问题,是闸门位置错了(该往
  Stage 2 更前面挪,或改成 hook 拦)。反向信号同样要记:出了 prototype 但用户仍在
  实施期纠偏,说明标注 `推断` 的粒度不够细。

- **cto-audit** — 2026-07-15 新增。发动权刻意只给用户(③),debrief Move 3 的审计信号层
  是它的提醒线(①)。观察期:两次收盘后看提醒是否真的触发过;若从未触发且用户也从未召集,
  按其自己的"有生有灭"律处理。

新增/改名任何原子 → 本表补一行(**接线点 = 新原子的准入证**)。空格子就是待接线清单。
