# Coding Agent 三方编排设计（host / vendors / subagents）

> 2026-07-23 定稿。来源：与 vito 的对抗式设计讨论（三轮）+ 8 透镜并行 brainstorm
> （sonnet×8, 340k tokens, 独立视角收敛验证）+ host 裁决式综合。
> 原始 brainstorm 综合稿：`~/Documents/claude-code/docs/coding-orchestration-brainstorm-2026-07-23.md`。
> 本文是正式设计文档，自包含。对齐 `docs/north-star.md`（廉价算力占比指标）与
> `docs/2026-07-22-vendor-eval-bench-direction.md`（bench 是本设计 vendor 画像的数据源）。

---

## 1. 需求背景

**约束**：host（主 agent，最贵最聪明）是 5x/5h 窗口硬配额，fan-out 无闸门会烧穿
（56-agent workflow 半小时烧光窗口的实证）。同时 vendor 订阅额度大量闲置
（cursor 非常满、dscode 便宜、arkcode 多、kicode 少）——廉价算力占比北极星指标 ≈0%。

**已实证的委派经验**（KOX 实战，IK3MCH/IK3MCI 等单）：

- worker 失败十有八九是**上下文/规格失败**，不是能力失败；
- 勘察结论一次勘察全程复用，是最划算的上下文资产；
- 更强模型更有主见，house style 遵从度未必赢；frontier 预算该花在对抗审查/硬调试，不是生成；
- vendor CLI 各有怪癖（协议/恢复语义），每加一个 vendor 是集成税；
- 并行 worker 改同片代码必撞；自审发现率趋近于零，coder 永不自审；
- rtk hook 可让 tsc/vitest 假绿；报告会粉饰（"自信幻觉 PASS"）；测试全绿 ≠ 功能可用
  （icc-fde 妙记静默坏三周）。

**问题**：如何设计一套编排，把确定性编码工作系统性地委派给 vendor/subagent，
省 host 50-70% token，同时质量不降？

## 2. 设计思路（含对抗演化）

**核心判断**：委派编码不是消灭工作，是把"写代码"转换成"写规格+验收"。
只有 规格+验收成本 < 自己写 时才赚。质量仪器自始至终只有一个：**验收命令套件的完备性**——
架构不提供质量，它让质量变便宜。

设计经三轮对抗收敛，关键裁决：

1. **spec 不可下放**。风格可 skill 化（跨任务复用模式），规格不能（一次性判断的载体：
   接口契约/边界/不变量/越界清单）。主 agent 不写 spec = 判断隐式泄漏给下游，或无人写
   → plausible-but-wrong。验收命令的质量 = spec 深度，两者耦合不可拆。
2. **生成用中档，审查用强异族**（与直觉相反的预算分配）。瓶颈在 spec+验收后，生成环节的
   模型能力边际收益递减；且生成是 token 最重环节，放最贵模型是成本倒挂。frontier 预算
   花在对抗审查和硬调试。
3. **review 不是一件事，是三种检查三种属主**：契约符合性=host 定向抽查（对自己写的 spec
   对不变量，非逐行重读）；质量/惯例/过度设计=异族强模型（输入只要 spec+diff）；行为正确性
   =执行验收。coder 自审直接排除。
4. **验收靠执行，不靠重读**。host 逐行 review diff ≈ 自己写一遍，丧失委派意义；但 host 对
   自己写的 spec 做定向不变量抽查是便宜的，这条保留。
5. **简单的任务不委派（盈亏平衡下限）；跨项目长任务是最佳甜区**——上下文杠杆最大，
   但前提是契约先行冻结 + context pack 显式收录跨仓隐性约定（镜像语义类）。

**最深的结构性风险**（红队）：spec 与验收命令同出一个脑袋。host 理解错了，spec 错、
验收也错，三层 review 两层共享错误前提，流水线**绿着错到底**。缓解见 §4.6。
"需求→spec" 这段链路的正确性由 host 自留负责，无解，承认它。

## 3. 总体架构

```
host(贵):  理解需求 → 拆任务 → 写 spec → 定验收命令 → 契约抽查 → 仲裁
           只做: 需求边界 / 验收取舍 / 约束优先级
router:    委派资格判定（能写出机器可判验收命令？粒度够？）→ 选 vendor（账本画像）
worker:    coding=中档 vendor │ E2E 验收=vendor 出报告 │ 质量 review=异族强模型
gates:     pre-red gate → 派前 probe → run receipt → 报告 validator →
           三层 review → 集成验收(merge queue) → 双过收尾
ledger:    零模型自动记账（双货币）→ 画像/熔断/governor 回流 router
```

## 4. 详细设计

### 4.1 路由器（router）——最先建，最值钱

委派充要条件：**能为任务写出机器可判的验收命令**。写不出 = 藏着判断，收回 host。

- **切分维度**：按决策密度切（每个可委派单元最多一个已拍板决策），垂直切"可独立跑验收的
  行为"，不按层切（层接缝是没人认领的判断区）。
- **盈亏下限**：spec:diff 比率闸门（spec token 预估 > 0.3×diff 预估 → 不委派，阈值待校准）；
  且按整个 job 总账判定（Σ spec+review+重试摊销 vs host 自做），防止切小绕开。
- **二维路由**：verification-strong（行为断言可机器判）→ 最便宜 vendor；verification-weak
  （只能判编译/类型）→ 失败模式是"绿但错"，必须升档或收回。账本按两队列分开记成功率，
  weak 队列阈值更高（>80%）。
- **spec lint**（零模型）：模糊词表（合理|适当|必要时|顺手|风格一致…）命中即 judgment-point，
  未逐条消解不可入队。词表从账本失败案例回流扩充。

### 4.2 spec 模板（按档位伸缩，防官僚化注水）

- **S 档**：{goal, files_owned(writes glob), acceptance_cmds, out_of_scope, escalate_when}
- **L 档**追加：{interface_contract(verbatim 签名+错误语义), invariants[],
  naive_failure_mode(host 自答"最可能的偷懒实现"，兼作异族审查种子),
  context_pack_refs, budget:{max_tokens, max_retries}, reads_contracts, needs_db/dev_server/tos}
- 验收命令逐条 schema：{id, cmd, baseline_expect: FAIL|N/A(纯回归), anti_fake(独立确证信号),
  fixture_min, provenance: spec|escaping:<issue_id>}。

### 4.3 上下文包（context pack）——manifest 化，不是散文

- **三层拆分**：任务层=spec（host 手写）｜项目层=house style/模块拓扑/recon 结论（只读缓存
  资产，跨委派复用）｜会话层=本需求已拍板决策（追加式）。组装模板化，host 只写任务层 delta。
- 文件清单={path, line_ranges, content_sha}；recon 资产带 {generated_at_sha, covers_glob}，
  diff∩covers_glob 非空即标 [STALE] 强制重勘察。
- **风格约束给正负样例对**（真实代码+"别这样写因为 X"的反例，取自近 90 天被 review 打回的
  diff），不给抽象规则。
- **派前 probe**（~2k token）：vendor 只答三问——改哪些文件/从哪个入口下手/验收怎么跑。
  与 host 的 writes 集比对，错位=补上下文重 probe（≤2 次）→ 仍错位=改路由。
  把"上下文失败"检测点前移到烧满编码预算之前。
- **跨仓隐性约定**：团队记忆（镜像语义、"改 X 前必读"类）蒸馏进每仓 context pack，随 spec
  强制附上；账本单列 context_missing 失败类验证 pack 覆盖率。
- pack 硬 token 预算（~12-15k），装不下 = 任务太大或判断没收敛，路由器一票否决。

### 4.4 worker 池与 vendor 舰队

- **Adapter 薄接口**：每 vendor 一个文件，只实现 spawn(spec_pack)→session_id /
  resume(session_id, feedback) / collect→{diff, report, cost_units, quota_state} /
  **clean_reset**(第 2 次失败起强制：新 worktree+只注入 spec+≤500 token 失败摘要，
  接入时用 canary 验证真的干净)。怪癖封在 adapter 内，路由器只见接口。
- **画像**：按 (vendor, task_type) 分箱，Beta 后验 + Wilson 下界打分；n≥6 且下界 ≥0.6 才接
  该类活；runs<6 = probation（占比 ≤20% 且强制双 review）；连续 3 次 capability 失败拉黑
  (v,t) 组合 30 天；vendor 版本漂移 → 先验回 0.5。路由分 = Wilson 下界 × 剩余配额系数。
- **新 vendor 准入**：shadow replay 黄金任务集（5-8 个验收可重放的真题）→ 5 单 canary
  （预算硬顶+双 review）→ 才进路由表。**准入条件是在某个任务类型上打赢现任者，不是存在即
  接入，舰队宁小勿全。**（vendor-eval-bench 成熟时即黄金集来源。）
- **失败归因 6 选 1**：spec_gap / context_gap / capability / quirk / flake / quota。
  拿不准默认 spec_gap（与证据同向偏置，宁改模板不错杀便宜 vendor）；capability 是唯一
  触发降档/拉黑的值。

### 4.5 验收与质量门（gates）

1. **Pre-red gate**（零模型，最高共识机制）：派发前自动 `git stash && run_acceptance &&
   expect_fail && git stash pop`——验收在基线上跑不出红 = 无灵敏度，拒绝派发。
   anti_fake 信号独立确证执行（tsc 配 --listFiles、pytest 配 collected 数），探测路径不许
   与被测命令共享同一可劫持层。
2. **防 reward hacking**：diff 机械切三区（implementation / tests_fixtures / config）；
   tests_fixtures 任何改动 host 必审+可拒收；run_receipt 里 touched_acceptance_files=true
   自动拒收 + 记 integrity_violation（三次 → 路由黑名单）。验收命令对 worker 可见（利自验）
   但修改权收死。注意：重试循环在教 vendor 验收长什么样，过拟合随重试次数恶化。
3. **机器凭证制**：vendor 交付必附 run_receipt（机器生成非自述）：{exit_code,
   acceptance_runs:[{cmd, stdout_sha256, exit_code}], diff_stat, files_touched, env_digest}。
   E2E 报告先过零模型 validator：evidence_ref 可解析、hedge 词扫描（应该|看起来|大概|
   没测但）命中打回、未验证区必填、环境指纹一致。**全绿才轮到 host 花 token；host 审产物
   完备性，不读叙述。** 残余风险：validator 防漏报不防伪报，证据真源抽查留给红线任务。
4. **三层 review**：契约符合性=host 定向抽查（红线任务恒 100%，稳态按抽查率滑动：连续 8 次
   双过零逃逸 → 降 1/3，1 次逃逸 → 回 100%）｜质量=异族强模型对抗 review（prompt 三段：
   spec 全文+diff+攻击指令"假设作者为过验收偷工"，finding 必须附 counterexample_input 否则
   拒收，style 意见 ≤3 条单列）｜行为=执行验收。coding 与 review vendor 必须异族（路由器
   硬约束）。
5. **集成验收（merge queue）——并行体系唯一必须的串行点**：worker 各自过验收 ≠ 合并后能过；
   rebase 使验收失效。候选分支按 diff_size 降序 merge --no-commit 到预览分支，跑全套验收，
   绿→逐个 FF，红→bisect 退回肇事分支。验收报告强制带 tree_hash，host 核对验收跑的就是
   待合 tree。
6. **并发控制**：spec 必填 writes glob + allowed_extra_writes；派发前并行任务两两求交，
   非空即串行或重拆；完成后 git diff --name-only 回验，越界拒收。契约类文件求交命中 =
   拆任务失败的信号 → host 先行落地契约，下游基于冻结契约并行。**lockfile 铁律**：依赖变更
   永远串行先行，并行任务禁止 install 新包。共享状态（DB/端口/TOS）当一等资源加锁，
   并行度=1。worktree 盈亏阈值：任务时长 < 2×环境准备时长 → 不开。

### 4.6 红队缓解：spec-验收同头相关性

- **spec 对抗审查**：派异族**便宜**模型（输入只有 spec+验收命令），固定 prompt"你是想偷懒
  的 coder，列 3 种能过全部验收但不满足意图的实现+对应补验收命令"。host 一分钟决定采纳
  哪条。打断同头相关性，成本极小。
- **变异抽检**：每 ~20 单抽 1 单机械注入已知破坏（删校验/边界±1/交换参数/吞异常），重跑
  验收必须抓到；抓不到冻结该 task_type 派发直到验收加固。完备性不可判定，灵敏度可采样。
- **逃逸缺陷三选一归因**：验收命令缺失（补命令）/ spec 缺失（改模板）/ reviewer 盲区
  （改攻击指令）；某层 >50% 修该层模板。新验收命令带 provenance 防误删。

### 4.7 失败恢复与熔断

- **恢复分级**：L0 环境类（零模型重试，不计失败）→ L1 vendor 自修（编译/lint）→ L2 换同档
  异族 vendor → **L3 升档/host 接管**（两次失败、integrity、失败模式互不相同=spec 有洞）
  → L4 升级人类。**只有 L3+ 消耗 host token，L0-L2 编排层闭环。**
- **防漂移**：第 2 次失败起 clean_reset，禁止 resume 续修（在漂移地基上盖楼）。
- **硬熔断**：(task_type, vendor) rolling-20 失败率 >40% → 熔断降级 host_direct；
  session 失败委派 token > 成功节省 30% → 冻结一切委派并告警；task_type 滚动 10 单
  net_savings 为负 → 移出可委派清单。闸门触发写 human-readable 事件进 session 日志。
- **降级路径事先定价**：vendor 故障是相关性的（月底额度集体见底）；哪些 task_type 冻结
  排队、哪些 host 亲自做（触发预算告警），每季度 chaos drill 演练一次，成本计入 ROI。

### 4.8 账本（ledger）与经济学

- **表**（扩 ccobs obs.db）：job_ledger{task_id, issue_id, task_type, route, plan_slug,
  spec_host_tokens, host_tokens_total, host_rescue_tokens, vendor, vendor_version,
  spec_pack_hash, attempts, escalated, rework_rounds, outcome, failure_mode, mutation_check,
  quota_state, merged_at} + vendor_runs 明细表。**写入零模型**，host 只在失败时填一行
  failure_mode。
- **双货币**：host 5h 窗口 token + vendor 窗口占比（quota 折算表），governor 按两者约束；
  host 窗口 >80% → 只放行判断活。单 session 硬顶：并发 vendor ≤3、委派 ≤8 单。
- **省率口径**：单位 = host_tokens_per_merged_task（失败/返工/善后全摊入）；固定报
  "质量门槛内省率"（只计双过无返工单）——防 Goodhart，滥委派会立刻把省率打下去。
- **达标证明**：对照基线（ccobs 回测历史 + 试点半随机对照两臂），声明 = 配对差值
  bootstrap CI 下限 > 50%。
- **退化 leading indicator**：host 回读深度、报告打回率、升级率的周斜率（比 rework 率
  早 1-2 周报警）；连续 2 周为正 → 该 task_type 自动降级 host_direct。

## 5. 残余风险（诚实清单）

1. **spec-验收同头相关性**只能缓解不能消除；"需求→spec" 链路无人兜底。
2. **逆选择**：好写验收的任务往往自己做也便宜，净赚中间地带可能比预想窄——账本 net ROI
   是唯一裁判。
3. **强耦合仓**（跨模块不变量/镜像语义）下 context pack 永远追不上隐性约定增速；
   **探索性工作**（验收无法预先写死）天然被路由器拒收——这两类仍是 host 主场。
4. validator 防漏报不防伪报；异族 review 全量跑会吃掉省下的额度（必须分层抽查）。
5. 账本冷启动期（n<6）路由在噪声上决策；归因打标准确率未经校准。

## 6. 待实验回答（试点收数据）

0. **【TODO】30 天 session 回测交叉验证**（vito 2026-07-23 补）：用 ccobs 账本（已含
   claude-code/codex/cursor-agent/cursor-ide/droid/grok/opencode 七源，30 天约 900+ 主会话）
   回测真实编码任务分布——任务类型 × 体量 × 结局 × 纠偏次数（`v_session_quality`）、
   host token 基线（`v_token_economy`）、委派现状（`v_agent_spawns`/vendor 各源用量）——
   交叉验证本方案的三个关键假设：可委派任务占比、盈亏平衡下限、§4.8 的"估算自做成本"
   基线锚。结论回写本文档修订。**这是试点启动的前置项，先于 §7.3。**
1. probe 错位阈值（30% 错位 = 上下文不足还是更优下手点？）
2. spec 对抗审查增量发现率（20 份历史 spec 盲测，低则只留高风险任务）
3. mutation score 各 task_type 合理阈值
4. 共享测试库能否廉价命名空间化（决定 E2E 任务并行度上限）
5. "估算自做成本"基线锚（纯 host 基线期 vs ccobs 回测——先做第 0 项，本项可能直接被吸收）
6. 集成验收批量窗口 N
7. spec:diff 比率阈值 0.3 的校准（第 0 项回测可直接给初值）

## 7. 落地路线

1. **先行件（零模型基建）**：pre-red gate 脚本、run_receipt schema、报告 validator、
   writes 求交校验、job_ledger 表（ccobs 扩展）
2. **30 天 session 回测**（§6 第 0 项）：验证假设、定基线锚，结论回写修订本文档
3. **spec 模板定稿**（S/L 两档）+ 每仓 context pack 蒸馏 + 最小 house style（~20 条硬规则，
   异族 review 锚点）
4. **试点**：30 张真实 issue、3-4 周、按 bugfix/feature/refactor 分层、半随机对照
   （host-direct vs 委派两臂）、governor 上线
5. **毕业标准**：配对省率 CI 下限 >50% + 逃逸归因分布稳定 + 无熔断触发。
   试点学费 = 一半单走对照臂的吞吐损失（已获 vito 认可方向，待正式启动确认）。

## 8. 与现有资产的关系

- **north-star**：本设计是"廉价算力占比"指标的主战场；账本同时喂"知识沉淀率"
  （逃逸归因 → spec 模板/context pack 改进）。
- **dispatch-vendors**：现行派单技能，是本设计的 worker 层前身；adapter 契约与账本
  字段向其兼容迁移。
- **vendor-eval-bench**：bench 真题 = shadow replay 黄金集来源，画像冷启动加速器。
- **advanced-plan**：plan_slug 是账本归因锚；spec_host_tokens 在打 plan 时顺手记账。
- **grill-me**：试点启动前的高风险决策（对照臂学费、governor 阈值）走它升级 CEO。
