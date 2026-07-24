# 质量门细则

验收靠执行，不靠重读——host 逐行 review diff ≈ 自己写一遍，丧失委派意义。
设计依据见 `docs/2026-07-23-coding-agent-orchestration-design.md` §4.5–4.6。

## 1. Pre-red gate（零模型，最高共识机制）

派发前在基线上跑验收，`baseline_expect: FAIL` 的命令必须跑红——跑不出红 =
无灵敏度，拒绝派发（`N/A` 纯回归项只要求基线绿）。在隔离 worktree /
固定 tree hash 上执行（stash 方案会漏未跟踪文件、中途失败还可能吞 stash）。
anti_fake 信号独立确证执行，
探测路径不许与被测命令共享同一可劫持层（hook 可让 tsc/vitest 假绿）。

## 2. 防 reward hacking

- diff 机械切三区：implementation / tests_fixtures / config。
  tests_fixtures 任何改动 host 必审 + 可拒收。
- run_receipt 里 `touched_acceptance_files=true` → 自动拒收 + 记
  integrity_violation（三次 → 路由黑名单）。
- 验收命令对 worker 可见（利自验）但修改权收死。
- 注意：重试循环在教 worker 验收长什么样，过拟合随重试次数恶化。

## 3. 机器凭证制（run_receipt + validator）

交付必附机器生成（非自述）的 receipt：
`{exit_code, acceptance_runs:[{cmd, stdout_sha256, exit_code}], diff_stat,
files_touched, env_digest}`。
报告先过零模型 validator：evidence_ref 可解析、hedge 词扫描
（`应该|看起来|大概|没测但`）命中打回、未验证区必填、环境指纹一致。
**全绿才轮到 host 花 token；host 审产物完备性，不读叙述。**
残余风险：validator 防漏报不防伪报——证据真源抽查留给红线任务。

## 4. 三层 review（三种检查三种属主，coder 自审排除）

| 检查 | 属主 | 形式 |
|---|---|---|
| 契约符合性 | host | 对自己写的 spec 做定向不变量抽查（红线任务恒 100%；稳态滑动：连续 8 次双过零逃逸 → 降 1/3，1 次逃逸 → 回 100%） |
| 质量/惯例/过度设计 | 异族强模型 | prompt 三段：spec 全文 + diff + 攻击指令"假设作者为过验收偷工"；finding 必须附 counterexample_input 否则拒收；style 意见 ≤3 条单列。**分层抽查而非全量**——全量跑会吃掉省下的额度 |
| 行为正确性 | 执行验收 | 跑命令，不读代码 |

## 5. 集成验收（merge queue——并行体系唯一必须的串行点）

worker 各自过验收 ≠ 合并后能过。候选分支按 diff_size 降序合入预览分支
（integration branch），跑全套验收：绿 → 预览分支整体合入主干（不要对
候选分支逐个 FF——第一个合入后其余分支就不再是主干祖先）；红 → 对候选
集合 bisect，退回肇事分支后重建预览。验收报告强制带 tree_hash，host
核对跑的就是待合 tree。

## 6. 并发控制

- spec 必填 writes glob + allowed_extra_writes；派发前两两求交，非空即
  串行或重拆；完成后 `git diff --name-only` 回验，越界拒收。
- 契约类文件求交命中 = 拆任务失败信号 → host 先行落地契约再并行。
- **lockfile 铁律**：依赖变更永远串行先行，并行任务禁止 install 新包。
- 共享状态（DB/端口/对象存储）当一等资源加锁，并行度=1。
- worktree 盈亏：任务时长 < 2× 环境准备时长 → 不开。

## 7. 变异抽检（验收灵敏度采样）

每 ~20 单抽 1 单机械注入已知破坏（删校验/边界±1/交换参数/吞异常），
重跑验收必须抓到；抓不到 → 冻结该 task_type 派发直到验收加固。
逃逸缺陷三选一归因：验收命令缺失（补命令）/ spec 缺失（改模板）/
reviewer 盲区（改攻击指令）；某层 >50% 修该层模板。
