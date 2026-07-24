# 失败恢复、熔断与账本

设计依据见 `docs/2026-07-23-coding-agent-orchestration-design.md` §4.4/4.7/4.8。

## 恢复分级（只有 L3+ 消耗 host token）

| 级 | 触发 | 动作 |
|---|---|---|
| L0 | 环境类（网络/quota 抖动） | 零模型重试，不计失败 |
| L1 | 编译/lint 红 | vendor 自修（resume 一次） |
| L2 | L1 后仍红 | 换同档**异族** vendor |
| L3 | 两次失败 / integrity / 失败模式互不相同（=spec 有洞） | 升档或 host 接管 |
| L4 | L3 仍不收敛 | 升级人类 |

- **防漂移**：第 2 次失败起强制 clean_reset——新 worktree + 只注入 spec +
  ≤500 token 失败摘要；禁止 resume 续修（在漂移地基上盖楼）。
- **覆盖下游默认**：经本 skill 派发时，此策略覆盖 dispatch-vendors 的
  "两次 resume" 默认——传输 brief 里写明 `max_resume=1`、第 2 次失败
  clean_reset。
- 失败归因 6 选 1：`spec_gap / context_gap / capability / quirk / flake /
  quota`。拿不准默认 spec_gap（宁改模板不错杀便宜 worker）；capability
  是唯一触发降档/拉黑的值。

## 画像与准入（vendor 舰队）

- Adapter 薄接口：每 vendor 一个文件，只实现
  `spawn(spec_pack)→session_id / resume(session_id, feedback) /
  collect→{diff, report, cost_units, quota_state} / clean_reset`。
  怪癖封在 adapter 内，路由器只见接口。
- 画像按 (vendor, task_type) 分箱：Beta 后验 + Wilson 下界；n≥6 且下界
  ≥0.6 才接该类活；runs<6 = probation（占比 ≤20% + 强制双 review）；
  连续 3 次 capability 失败 → 拉黑该组合 30 天；版本漂移 → 先验回 0.5。
  路由分 = Wilson 下界 × 剩余配额系数。
- 新 vendor 准入：shadow replay 黄金任务集 → 5 单 canary（预算硬顶+双
  review）→ 才进路由表。**准入条件是在某个任务类型上打赢现任者**，
  舰队宁小勿全。

## 硬熔断

- (task_type, vendor) rolling-20 失败率 >40% → 熔断降级 host_direct。
- session 失败委派 token > 成功节省的 30% → 冻结一切委派并告警。
- task_type 滚动 10 单 net_savings 为负 → 移出可委派清单。
- 退化 leading indicator：host 回读深度、报告打回率、升级率的周斜率
  （比 rework 率早 1-2 周报警）；连续 2 周为正 → 该 task_type 自动降级。
- vendor 故障是相关性的（月底额度集体见底）——降级路径事先定价：哪些
  task_type 冻结排队、哪些 host 亲自做。

## 账本（扩 ccobs obs.db，写入零模型）

`job_ledger{task_id, issue_id, task_type, route, plan_slug,
spec_host_tokens, host_tokens_total, host_rescue_tokens, vendor,
vendor_version, spec_pack_hash, attempts, escalated, rework_rounds,
outcome, failure_mode, mutation_check, quota_state, merged_at}`
+ vendor_runs 明细。host 只在失败时填一行 failure_mode。
verification-strong / weak 两队列**分开记成功率**——weak（只能判编译/
类型）失败模式是"绿但错"，阈值更高（>80%）。

- **双货币** governor：host 5h 窗口 token + vendor 窗口占比；host 窗口
  >80% → 只放行判断活。单 session 硬顶：并发 worker ≤3、委派 ≤8 单。
- 省率口径：`host_tokens_per_merged_task`（失败/返工/善后全摊入），固定报
  "质量门槛内省率"（只计双过无返工单）——防 Goodhart。

## 回测基线（2026-07-24，30 天 ccobs 窗口，判定用）

- **自做成本锚**（done 中位 out tokens，含 subagent）：feature 44k ·
  bugfix 40k · refactor 35k · ops 11k · config 8k——"估算自做成本"直接查表。
- **一次过率**（done 且零纠偏）：ops 84% > refactor 79% > bugfix 72% >
  config 69% > **feature 56%**（高危，强制 L 档）。
- 可委派池 ≈ 编码会话的 40-50%（编码类占全部会话 55%）；<10k out tokens
  占编码会话 35%——此线是**事后审计线**（委派单实际产出频繁落线下 →
  收紧资格门三信号），不是派发前预测闸门（token 预测极不准，不做）。
- 北极星起点：廉价算力 output token 占比 **6.2%**（vendor 侧无 token
  计量，真实略高——账本待补项）。
