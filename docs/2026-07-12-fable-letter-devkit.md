# 给 Vito 的信 · dev-kit 篇 — 接线、称重、回收

> 2026-07-12,Claude Fable 5 离场前留下的三封信之一(另两封:kox 仓 `docs/2026-07-12-fable-letter-kox.md`、
> study-kit 仓 `docs/2026-07-12-fable-letter-study.md`)。
> 证据来源:ccobs obs.db 当日快照、LEARNED.md、dispatch ledger、SKILL-CANDIDATES.md、三仓 git 史、你 qmd 库里的原文。
> **用法:这是咀嚼材料,不是执行清单。** 我一行 SKILL.md 都没改——每个建议都附上了它的反面,
> 你嚼完认同哪半句,再从零建你自己的版本。北极星和 3 次规则依然是裁决者,我只是把证据摆整齐。

---

## 一、先照镜子:系统今天真实的样子

你在 grill-me 里立过规矩:摩擦感受可能有记忆偏差,以 ccobs 数据为准。所以先报数,再讲故事。

**使用率是两个世界。** 高频的全是"长在路径上"的:kox-browser-test 105 次、agent-browser 104、
kox-tls-log 93、kox-deploy-k8s 64。低频的全是"等你想起来"的:dispatch **1** 次、blindspot **1**、
skill-atlas **1**、ccobs 2、worktree 4、handoff 5、debrief 8、write-plan 14
(低频计数已合并改名前后的命名空间,如 debrief = 5+3)。
中间层是 grill-me 17、exa-code 26、create-readable-html 29——有触发词肌肉记忆的活了下来。

**token 经济的账本是单极的,但现实不是。** 主会话 opus 累计输出 26.3M tokens(355 sessions),
全部 subagent 输出加起来 ≈2.4M,约 7%。外部引擎(deepseek/glm)在 v_token_economy 里是 **0 行**
——但复核时把原始 session JSONL 翻了一遍:**160+ 个会话文件里躺着 deepseek 模型串、6,300+ 个
turn(flash:pro ≈ 3:1)。廉价算力早已在大量流动,只是从没被 ingest 记账**(展开见第四节)。

**会话形态和你以为的不一样。** observations 表里 research 类 931 次,占已蒸馏会话的 **68%**
(蒸馏有门槛:3138 个会话里入观测的是 1361 个,短会话不记账);feature 165、bugfix 149。
而 research 的结局:done 447、unknown 275、partial 202——**过半没有明确结论**。
纠偏次数倒是好消息:research 均值 ≈0.03,feature 0.54,bugfix 0.28。北极星立项时那个
"长 session 35+"已经是历史——口径提醒:那是单个长会话里的计数,这是按 observation 的均值,
不能直接画等号;但量级上,纠偏已经低到不构成问题。

**钩子层完全健康。** on-stop 990 次 0 错误,learn-capture 681 次均值 57ms,auto-capture 673 次。
管道没病,病在管道两端的人类动作(后面讲)。

---

## 二、接线定律:决定一个 skill 命运的不是质量,是有没有 call site

把上面的使用率表竖过来看,规律只有一条:**每个高频 skill 都长在某条日常路径上,
每个低频 skill 都在等待被想起。** browser-test 长在 E2E 验收里,tls-log 长在排障里,
deploy 长在发版里;而 dispatch/blindspot/skill-atlas 是"能力很强的孤儿"。

你自己 07-08 就把这条定律写进 LEARNED 了:"任务直接进 /ship,pre-work 类技巧必须接线到
ship 阶段内自动触发,不能只做 standalone skill"。v2.0 的 ship 已经把 blindspot/dispatch/debrief
接成配套增强——方向完全对,但它今天才落地,还没有一次实战数据。信里我想把这条定律推到底:

**给每个原子做"谁调你"审计。** 一个原子的 call site 只有三种诚实答案:
① 某条 workflow 的固定阶段(如 ship Stage 1 调 blindspot);② 一个钩子或定时器;
③ 用户的触发词肌肉记忆(如"收盘"、"派活")。"description 写得好"不是答案——
好 description 只保证被路由到,不保证被想起。下次 skill-atlas 体检时,除了路由重叠,
建议加一列 `call site`,填不出来的原子就是博物馆展品,要么给它找个接线点,要么承认它
是低频按需工具(audit-context/docs-organize 这类月度卫生活,低频是天性,不是病)。

顺着这条想:四个月度卫生原子(skill-atlas、audit-context、docs-organize、ccobs 报告)
共享同一种"没有时间触发器"的病。解法未必是新 skill——可能就是一条 cron/schedule 带四行清单。
反面:cron 跑出来的报告没人看,等于没跑。也许更符合你习惯的是把"月度体检"变成某个
自然节点的搭车动作(比如每次 bump minor 版本时顺手跑)。嚼一下哪个真的会发生。

顺带一个悬案:`/goal` 被调过 47 次——meta 层使用率最高的入口,最后一次是 07-11 晚上
(v2.0 落地前夜)——但今天我在全盘找不到它的定义(全局 skills、kox-base 项目层、
本仓 .claude 都翻过)。如果是 v2.0 清理时有意退役,当我没说;如果它还活在某个我没扫到的
角落,那它是舰队里唯一游离在 atlas/trigger-eval 之外的高频入口,值得给它上户口。

---

## 三、68% 问题:research 会话没有自己的流水线

北极星流水线(需求→实现→收盘)覆盖的是开发任务,但账本说你三分之二的会话是 research 形态,
且过半以 unknown/partial 收场。这些会话的结论——技术选型判断、"查过了,不行"、
某 API 的坑——今天全靠蒸发散热。

先立一个反命题防止过度设计:**大多数 research 就该是一次性的**,给 931 次会话全上仪式
是灾难。真正的设计题是:**如何用零仪式接住那 5% 承重结论**。三个选项,故意不替你选:

1. **什么都不做。** 现状。靠你在重要时刻说"收盘"。数据说这件事发生了 8 次。
2. **用已经存在的沉淀。** ccobs 的 auto-capture 早就在机械地蒸馏会话
   (observations.summary,已覆盖 1361 个够料的会话)——沉淀其实已经自动化了,缺的是**召回**。
   一条"开工前先查同类会话结论"的 SELECT 就能闭环。张力在于:北极星观察项明确否决过
   "SQLite/向量库记忆基建"——但 obs.db 是已经存在的观测基建,召回是一条查询,不是新系统。
   界线画在哪,值得你自己裁。(用的话带一条戒律:summary 是机器蒸馏的,召回即怀疑——
   它记录的是当时看起来的结论,不是核实过的事实。)
3. **qmd 桥。** 承重结论写成一段 markdown 进 knowledge-base 仓,qmd 自动可查。
   你 07-12 刚立过"qmd 是外部资料的 source of truth"——这是把自产结论也纳入同一个
   检索习惯,和 compound engineering(你 qmd 里那篇 Every 的原文)的"每次工作让系统更聪明"
   完全同构。代价:收盘多一个动作,违反零仪式,除非它只在"结论明显承重"时由 AI 主动提议。

我的倾向是 2+3 组合(2 管"我是不是查过这个",3 管"值得复用的结论"),但倾向不重要——
重要的是这块地今天完全没人认领,而它是账本里最大的一块。

---

## 四、廉价算力:它不是没发生,是没记账

先纠正一个误判(这封信的初稿也犯了):指标二不是"接近零",也不是"无法读数"。
我核实了 openclaude 的实现——dscode/arkcode 只改环境变量,共用 `claude` 二进制和同一套
session 存储;然后把原始 JSONL 翻了个底朝天:**160+ 个会话文件带 deepseek 模型串,
6,300+ 个 turn**。廉价算力早就在大量流动,只是 ccobs 的 ingest 从没把这些会话灌进
turns 表。"0 行"是记账缺口,不是使用缺口。这改写了故事的重心:

1. **先 ingest,再谈建设。** 指标二很可能已经实质性达标——一次 ingest 排查 +
   v_token_economy 按 provider 分列(model 串自带 provider,分列是安全的),
   这个指标就能读数甚至标绿。这优先于任何新机制。
2. **更有意思的暗线:流量绕开了 dispatch 协议。** dispatch ledger 只有 2 行(07-11、07-12,
   都判 tier3、pass 带 inline fixup),而 165 个会话说明你早就在直接裸开 dscode/arkcode 干活。
   这是接线定律的又一实证:shell 函数长在手上,协议层还没长进习惯。所以真正的问题不是
   "开始用便宜引擎",而是:**简报契约/重试预算/ledger 这层协议,相对裸开引擎的增益是什么?**
   两条路都已在跑,数据能回答——裸开会话的返工率 vs 走协议的一次成过率,ingest 之后就能比。
3. 校准建议降为第二位:之后走协议的派活里,刻意挑几次 rung-1 形状的活(settled plan 后的
   批量机械改),从梯子底部试出便宜档的真实天花板。一直从 tier3 起跳,梯子就永远只是文档。

顺手修的还有一个已知的"狼来了":v_agent_spawns 的 missing_model 把"frontmatter 带模型的
裸调用"(如 k8s-deployer 55/55)也算违规——join 一下 agent 注册表算 effective model,
这个视图才值得信。

最后一个诚实的注脚:指标二的分母大头不在 subagent,在**主会话本身**——opus 主会话
累计输出 26.3M tokens,而会话的 68% 是 research 形态、纠偏 ≈0.03。这类"查一下"型会话
有多少真的需要旗舰模型?你已经在手动切换了(/model 77 次),缺的只是一条默认习惯的
候选:轻 research 用轻模型起步,不够再升。这一刀比整个引擎舰队的杠杆都长,
但它动的是手感,只有你自己能裁。

---

## 五、debrief 与 LEARNED:仪式收缩,反射接管

debrief 设计得很好,但它是"纪律形状的工具",装在"反射形状的工作流"里——8 次使用对几百个
任务会话。v2.0 把它接进 ship finalize 是正解(kox 任务从此自动收盘);剩下的泄漏面是非 ship 会话。

但注意一件事:auto-capture 已经在被动做"Move 2 的 lite 版"(对够料的会话自动蒸馏 summary)。
所以值得嚼的不是"怎么让 debrief 跑更多",而是**收缩 debrief 的承诺**:归档(Move 1)和
固化(Move 3)是它不可替代的部分;蒸馏(Move 2)只在"下个会话没它会错"时出手,
其余交给已经在转的机械沉淀。工具的野心小一号,使用率反而会诚实。

LEARNED 收件箱有个正在发生的锈蚀:07-11 那条"engines.md 过时待修"当天就修好了
(engines.md 里 --model 用法已更新),但规则还躺在收件箱里,每次开会话被 session-replay
复读。**毕业不及时,收件箱就从信号变噪声。** 嚼:debrief 加一个 Move 0——"扫一眼 LEARNED,
本次任务顺手解决/证伪的行,当场毕业或删除";或者更懒:replay 时跳过 30 天前的行。

---

## 六、SKILL-CANDIDATES 是台否决机,这是它最好的功能——但 fold 是动作不是判词

账本:6 个候选,**0 个毕业**,全部带着理由躺平——near-neighbor 折叠、"一行代码解决"、
"脚本即产物"。这不是失败,这是 3 次规则按设计工作:**它的产品不是新 skill,是有据可查的
"不做"决定**。归档目录里 10 个 skill、7 个 agent 的坟场证明减法是你系统真实的呼吸方式。庆祝它。

但有一笔债:判词写"fold 进 ship 的 L 档指引"(ship-multi-repo-workflow-lanes 那行),
而今天 ship SKILL.md 里只有一行跨项目放置约定,没有 lane 编排指引。
**"fold into X"没有落成 X 的 diff,就只是张欠条。**
嚼一条小规矩:near-neighbor 折叠类候选的关闭条件 = 目标文件的 diff 落地,debrief Move 3
提议 fold 时连带给出那个 diff。(kox 篇的信里我把这笔债展开讲了。)

---

## 七、北极星仪表盘:三个指标都该换成 ccobs 读数

立项时的基线是 07-02 调研快照(沉淀~0%、廉价算力~0%、纠偏 35+)。今天的诚实读数:

| 指标 | 立项快照 | 今日证据 | 状态 |
|---|---|---|---|
| 知识沉淀率 | ~0% | LEARNED 10 条、SKILL-CANDIDATES 6 行、memory 若干、RESUME.md 在长 | 在动,但无比率读数 |
| 廉价算力占比 | ~0% | 原始 JSONL 160+ 个 deepseek 会话/6,300+ turns 未 ingest;dispatch ledger 2 行 | **已大量发生,未记账**(见第四节) |
| 纠偏次数 | 35+/长会话 | research ≈0.03 / feature 0.54 / bugfix 0.28(observation 口径) | 低到不构成问题;严格标绿需按会话口径重算 |

嚼:一个季度一次,用一条固定 SQL(或一个 v_northstar 视图)出这三个数,替代体感。
你已经有了裁判(SQLite),别再让原告(记忆里的摩擦感)兼任。

---

## 八、别做的清单(把你自己的减法纪律回敬给你)

- 别建 research 版 ship——68% 问题的解在"零仪式接住 5%",不在新流水线。
- 别加第四条 resume 路径。已有 ship Stage 0 / write-plan resume / handoff / worktree attach
  四张网,该做的是下次体检时验证"继续 <X>"永远落对网,而不是再织一张。
- 别给低频卫生原子(audit-context 等)加戏,低频是它们的天性。
- 别在把已发生的 deepseek 流量 ingest 进账本之前扩编引擎舰队——先看见存量,再谈增量。
- write-plan 是最重的原子(16K 字符),下次 context-sizer 跑分时看一眼——但别为瘦身而瘦身,
  它 14 次使用次次承重。

---

## 尾声

这套系统 v2.0 之后已经不缺零件了。账本说得很清楚:**下一级复利不来自新原子,
来自让既有回路不靠意志力也能转**——接线(每个原子有 call site)、称重(指标换成读数)、
回收(欠条变 diff、收件箱按期毕业)。你 qmd 里那篇 harness 文章的判词在你系统上同样成立:
瓶颈已经从 generation 移到了 verification——对你而言,是从"造工具"移到了"让工具的账本说话"。

不知道下次相遇是哪个版本的我。如果这封信里有哪句话三个月后被证明是错的,
那它也完成了任务——它至少值一行 LEARNED。

— Fable,2026-07-12
