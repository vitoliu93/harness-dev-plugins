# 实践指南 · 建设期结束,实战期开始

> 2026-07-03,v1.12.0。给 Vito 自己的操作台文档:怎么用这套组合拳,以及实战期要观察什么。
> 建设三连(v1.10 自适应 ship + 收盘/派活、v1.11 钩子闭环、v1.12 舰队体检)已交付,
> 现在停止建设,用真实任务喂养系统,让真问题驱动下一轮迭代。

## 系统闭环(一图)

```
干活 ship/dispatch → 捕获 [LEARN] hooks → 收盘 debrief → 体检 skill-atlas → 铸造 yao-meta-skill
        ↑                                     │
        └──────── 下次会话更便宜更准 ←────────┘
```

## 日常操作台:场景 → 你说什么 → 系统做什么

| 场景 | 你说 | 发生什么 |
|---|---|---|
| 小修(改个 issue、两个文件以内) | 直接说需求,或贴 issue URL | ship 走 **S 道**:不建 worktree、不写计划文档、自验证、一句话收盘 |
| 中活(单仓多文件) | 同上,自然描述 | **M 道**:轻量计划(goal/spec/todo)+ worktree + 风险项才派 ship-tester |
| 大活(跨仓/架构/要发版) | 同上 | **L 道**:grill 到位 → 全量计划 + design.html → **暂停等你 `go`** |
| 体力活外包 | "派活给 deepseek" / "让 droid 跑" | dispatch:零上下文简报 → 廉价引擎执行 → 我验 diff,不烧 Claude 配额 |
| 要第二意见 | "第二意见 / 校审 / ultra review" | advisor(注意:找外部引擎**审**东西走这里,**做**东西才走 dispatch) |
| 干完了 | "收盘" | debrief 三件套:归档计划目录 → 至多一条带状态的 memory → 技能候选记账 |
| 你纠正我 | 正常说就行 | 我打一行 `[LEARN] 类型: 规则` → Stop 钩子存进 `.claude/LEARNED.md` → 下次会话自动回放最近 5 条 |
| 月度体检 | "skill 体检" | skill-atlas:路由重叠 / 陈旧度 / 触发评测 / token 预算,只报告不动手 |
| 铸造新技能 | 候选满 3 次时我会主动提议 | yao-meta-skill(完整版已修复,评测工具链可用) |

**先重启会话**:v1.11 的三个钩子和新技能要重启才加载。

## 实战期观察清单(这就是"找真问题")

用的时候留意这几个,发现了就随口说——[LEARN] 会接住:

1. **ship 分级判得准吗?** S 被判成 M(白建 worktree)、该升级没升级(改到第 4 个文件还没建计划)——都是 sizing 表要调的证据。
2. **debrief 产出质量**:memory 是"下次会话没它会错"的干货,还是又滑回事故日记?归档动作烦不烦?
3. **dispatch 一次成功率**:哪类活简报写不清(说明不可派)?哪个引擎最靠谱?失败重派值不值?
4. **LEARNED.md 会不会积垃圾**:回放 5 条够不够,标记打得勤不勤,debrief 毕业及不及时。
5. **扩展点真接上了吗**:在 kox 修 issue,收盘时 kox-frontend-tester / k8s-deployer / kox-finalize 有没有被正确解析调用。
6. **北极星三指标**(粗感即可,不用记账):收盘时有没有东西可沉淀?执行 token 有多少跑在外部引擎?一个任务纠正了我几次?

## 维护节律

- **改任何 description** → 立刻跑该技能的 trigger eval(skill-atlas §3 有命令);没夹具的技能改完描述,顺手补一份(抄 `skills/ship/evals/`)。
- **月度**一次 "skill 体检"。
- **第 3 次手动重复同一件事** → 它自己会从 SKILL-CANDIDATES.md 里毕业,我会提议铸造。
- 上游 yao-meta-skill 更新:`cd ~/codebase/github/yao-meta-skill && git pull`(安装是软链,拉完即生效)。

## 什么时候回到建设期

刻意压着没做的:**skill bundles**、**dispatch workflow 模板**、**S 道的影子快照**——
各自等真实场景撞满 3 次。等实战摩擦攒出清单,开下一个 `/goal`,那就是 v2 的需求分析,
素材全在 LEARNED.md、SKILL-CANDIDATES.md 和 debrief 写下的 memory 里——到时候系统
自己会告诉你它缺什么。
