# 实践指南 · 建设期结束,实战期开始

> 2026-07-03,v1.12.0。给 Vito 自己的操作台文档:怎么用这套组合拳,以及实战期要观察什么。
> 建设三连(v1.10 自适应 ship + 收盘/派活、v1.11 钩子闭环、v1.12 舰队体检)已交付,
> 现在停止建设,用真实任务喂养系统,让真问题驱动下一轮迭代。

## 系统闭环(一图)

```
干活 ship/orchestrate → 捕获 [LEARN] hooks → 收盘 debrief → 体检 skill-review → 铸造 skill-forge
        ↑                                     │
        └──────── 下次会话更便宜更准 ←────────┘
```

## 日常操作台:场景 → 你说什么 → 系统做什么

| 场景 | 你说 | 发生什么 |
|---|---|---|
| 开发任务(kox 项目) | 直接说需求,或贴 issue URL | **kox ship 五段**:上下文收集 → 可验收计划 → 实施 → E2E 验收 → finalize 收尾(S 号快道免计划文档) |
| 非 kox 的多步任务 | "立项 / advanced-plan" | advanced-plan:goal/spec/todo + worktree 隔离,每 phase 带验收字段 |
| 多角色协作 | "安排 advisor/programmer/audit" / "并行做" | orchestrate:拆角色、排依赖、验收，并在 Herdr 中给每个角色一个 tab |
| 启动一个 agent | "用 fable" / "开 cursor-agent" / "配置在哪" | use-agents:读取本机渠道，给出 Herdr 或 headless 启动方式 |
| 要第二意见 | "第二意见 / 校审" | orchestrate 安排 advisor；use-agents 只负责启动选定渠道 |
| 干完了 | "收盘" | debrief 三件套:归档计划目录 → 至多一条带状态的 memory → 技能候选记账 |
| 你纠正我 | 正常说就行 | 我打一行 `[LEARN] 类型: 规则` → Stop 钩子存进 `.claude/LEARNED.md` → 下次会话自动回放最近 5 条 |
| 月度体检 | "skill 体检" | skill-review:路由重叠 / 陈旧度 / 触发评测 / token 预算,只报告不动手 |
| 铸造新技能 | 候选满 3 次时我会主动提议 | skill-forge(消化自 yao-meta-skill:资格门 + trigger-first 评测,工具链已 vendored) |
| 动手前对齐决策 | "grill me / 盘问我" | grill-me(CEO/CTO 分层:高风险决策逐个问,细节自决+公示) |

**先重启会话**:v1.11 的三个钩子和新技能要重启才加载。

## 实战期观察清单(这就是"找真问题")

用的时候留意这几个,发现了就随口说——[LEARN] 会接住:

1. **ship 分级判得准吗?** S 被判成 M(白建 worktree)、该升级没升级(改到第 4 个文件还没建计划)——都是 sizing 表要调的证据。
2. **debrief 产出质量**:memory 是"下次会话没它会错"的干货,还是又滑回事故日记?归档动作烦不烦?
3. **orchestrate 协作质量**:角色是否过多?交接是否清楚?Herdr tab 是否按时关闭?
4. **LEARNED.md 会不会积垃圾**:回放 5 条够不够,标记打得勤不勤,debrief 毕业及不及时。
5. **kox ship 五段跑得顺吗**:收尾是否正确接到 gitee-issue-finalize,E2E 是否按场景(前端/后端/agent/ops)选对了验收方式。
6. **北极星三指标**(粗感即可,不用记账):收盘时有没有东西可沉淀?执行 token 有多少跑在外部引擎?一个任务纠正了我几次?

## 维护节律

- **改任何 description** → 立刻跑该技能的 trigger eval(skill-review §3 有命令);没夹具的技能改完描述,顺手补一份(抄 `skills/use-agents/evals/`)。
- **月度**一次 "skill 体检"。
- **第 3 次手动重复同一件事** → 它自己会从 SKILL-CANDIDATES.md 里毕业,我会提议铸造。
- 评测工具链已 vendored 进 `skills/skill-forge/scripts/`(yao-meta-skill@4eb11f9),上游不再跟踪;脚本坏了修 vendored 版。

## 什么时候回到建设期

刻意压着没做的:**skill bundles**、**dispatch workflow 模板**、**S 道的影子快照**——
各自等真实场景撞满 3 次。等实战摩擦攒出清单,开下一个 `/goal`,那就是 v2 的需求分析,
素材全在 LEARNED.md、SKILL-CANDIDATES.md 和 debrief 写下的 memory 里——到时候系统
自己会告诉你它缺什么。
