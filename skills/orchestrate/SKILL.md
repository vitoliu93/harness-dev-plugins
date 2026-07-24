---
name: orchestrate
description: >-
  Route and delegate coding work across vendors / subagents / host:
  委派资格判定（能否写出机器可判的验收命令）、spec+验收命令起草、并行 worker
  编排与质量门、失败恢复分级。Trigger when the user asks to 委派/delegate/派活
  coding tasks, 编排/fan out parallel workers across issues, asks "这个任务适合委派吗",
  wants a spec pack with acceptance gates for a worker, or when you are about to
  fan out coding work yourself. NOT for single-task vendor CLI transport —
  that is dispatch-vendors (this skill decides and specs; it hands transport off).
argument-hint: "[task or batch to delegate]"
---

# orchestrate

委派编码不是消灭工作，是把"写代码"转换成"写 spec+验收"。只有
spec+验收成本 < 自己写 才赚。质量仪器自始至终只有一个：**验收命令套件的
完备性**——架构不提供质量，它让质量变便宜。正式设计（含对抗演化与残余
风险）：`docs/2026-07-23-coding-agent-orchestration-design.md`。

**流程**：资格判定 → 三岔路由 → 写 spec pack → 过质量门时序 → 传输
（vendor 走 dispatch-vendors / subagent 直接 spawn）→ 验收与恢复 → 记账。

## 委派资格（router，逐条过，全 AND）

- **第一道硬门（必要非充分）**：能写出机器可判的验收命令。写不出 =
  藏着判断，host 自做。
- **盈亏下限不做 token 预测**（预测极不准）。派发前用三个可观察信号：
  ① 类型默认——config/ops 整类贴盈亏线（中位 8-11k），默认不委派；
  ② 免勘察测试——不用勘察就能说出改哪个文件哪个函数 → 自己做；
  ③ spec 副产品——写 spec 时发现已把 diff 写出来 / 写 spec 比改还慢 →
  当场收回。10k 产出线只作账本**事后审计**：委派单频繁落线下 = 上面
  三条放行太松。spec:diff 0.3 同理记事后指标，派发前等价物即 ③。
- 探索性工作、强耦合仓（跨模块不变量）是 host 主场；跨项目长任务是
  最佳甜区——前提是契约先行冻结。总账仍按整个 job 判定（Σ spec+review+
  重试摊销），防切小绕开。
- 按**决策密度**切：每个可委派单元最多一个已拍板决策；垂直切"可独立跑
  验收的行为"，不按层切。
- verification-weak（只能判编译/类型）失败模式是"绿但错"→ 升档或收回。
- spec lint：模糊词（合理|适当|必要时|顺手|风格一致）命中即 judgment-point，
  未逐条消解不入队。

## 三岔路由

- **vendor CLI**（传输走 dispatch-vendors）：整块独立任务、吃配额的重活。
  **生成用中档，审查用强异族**——frontier 预算花在对抗审查/硬调试，不是生成。
  coding 与 review vendor 必须异族（硬约束）。
- **subagent**：需要本会话上下文的切片、勘察/搜索类。结构上给不了模型多样性。
- **host 自留**（判断活永不下放）：需求边界、写 spec、定验收命令、契约
  抽查、仲裁、L3+ 救援。spec 不可下放——不写 = 判断隐式泄漏给下游。

## Spec 与上下文

S 档 `{goal, files_owned, acceptance_cmds, out_of_scope, escalate_when}`；
L 档追加契约/不变量/naive_failure_mode/预算——**feature 类强制 L 档 +
spec 对抗审查**（回测：一次过率最低 56%，失败均值 6× done 中位）。
context pack 三层拆分
（任务/项目/会话），硬预算 ~12-15k，装不下 = 任务太大或判断没收敛。
模板与验收命令 schema：`references/spec-pack.md`。

## 质量门（时序）

pre-red gate（基线必须跑红，否则验收无灵敏度）→ 派前 probe（三问比对
writes）→ worker → run_receipt + 零模型 validator（全绿才轮到 host 花
token）→ 三层 review（host 契约抽查｜异族强模型对抗 review｜执行验收）→
merge queue 串行集成 → 双过收尾。并行任务 writes 两两求交，非空即串行；
tests/fixtures 改动 host 必审。细则与防 reward hacking：`references/gates.md`。

## 失败恢复与记账

L0 环境重试 → L1 vendor 自修 → L2 换异族同档 → L3 升档/host 接管 →
L4 人类；**只有 L3+ 消耗 host token**。第 2 次失败起 clean_reset，禁止
resume 续修。归因 6 选 1，拿不准默认 spec_gap。熔断阈值、画像打分、
账本字段：`references/recovery-ledger.md`。
