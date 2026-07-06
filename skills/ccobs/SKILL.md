---
name: ccobs
description: >-
  Claude Code 可观测账本：把 ~/.claude/projects 的原始 session JSONL 增量灌入
  SQLite（事实+指针，不存正文），提供 6 个观测视图——skill 使用率、agent spawn
  模型纪律、token 经济（按引擎/主链-子链分账）、hook 健康度、项目周活、语义质量
  （便宜模型蒸馏）。当用户说「观测报告」「usage report」「哪些 skill 没人用」
  「token 花在哪了」「agent 有没有带 model」「ccobs」，或 skill-atlas 体检需要
  使用率数据、debrief 收盘要会话统计时使用。不负责语义记忆检索（qmd/claude-mem
  的事）、也不负责实时监控。
---

# ccobs — Claude Code observability ledger

三层架构：**JSONL（原始账本，30 天保留期后蒸发）→ SQLite 事实层（SQL 提取，永久）
→ observations 语义层（便宜模型蒸馏，永久）**。DB 是派生索引：删库随时可重建
（`rm ~/.claude/observability/obs.db* && bun scripts/ingest.ts`），但注意已被
保留期删掉的原始文件不可恢复——所以 launchd 每日兜底跑。运行时 bun（`bun:sqlite`
内置，零依赖）；install.sh 会自动装 bun。

## 布局

- DB / 队列 / 日志：`~/.claude/observability/`（`CCOBS_DIR` 可覆盖）
- `scripts/schema.sql` — 表 + 6 个视图，views 即报告
- `scripts/ingest.ts` — 增量、幂等灌库（按文件字节偏移续读；uuid 主键去重；全量 1.1GB ≈ 2s）
- `scripts/obs-enqueue.ts` — Stop hook：只 append 一行到 queue.jsonl，毫秒级
- `scripts/install.sh` — macOS(arm) 启动器：自动装 bun + launchd 每小时（灌库→蒸馏，RunAtLoad 开机补跑）+ 首次灌库
- `scripts/distill-prompt.md` — 语义蒸馏 prompt v1（deepseek-flash / gemma 级别）
- `scripts/distill.ts` — 蒸馏 runner：读未蒸馏 session → 摘要（用户/助手文本+工具名，无工具输出）
  → 调 OpenAI 兼容便宜模型 → 写 observations。Provider 解析：`~/.claude/observability/llm.json`
  显式覆盖优先；否则按 DEEPSEEK > GEMINI > OPENROUTER > LMSTUDIO 的顺序取第一个有
  `*_API_KEY` 环境变量的；都没有就静默跳过。launchd 不继承 shell env——install.sh
  会把安装时在场的 key 烤进 plist 的 EnvironmentVariables（轮换 key 后重跑 install.sh）。

## 用法

```bash
# 换新机器 / 首次安装
bash scripts/install.sh

# 手动灌库（增量，秒级）
bun scripts/ingest.ts                # 全量扫描
bun scripts/ingest.ts --project kox  # 只扫匹配的项目目录
bun scripts/ingest.ts --queue        # 只消费 Stop hook 队列

# 看报告（六个视图任选）
sqlite3 -header -column ~/.claude/observability/obs.db "SELECT * FROM v_skill_usage LIMIT 20"

# 语义蒸馏（需先配 llm.json；launchd 每晚也会自动跑）
bun scripts/distill.ts --dry-run        # 只打印 digest+prompt，验收摘要质量
bun scripts/distill.ts --limit 5        # 试蒸馏 5 个，抽查 observations 表
bun scripts/distill.ts --session <id>   # 换模型/改 prompt 后重蒸某个 session
```

蒸馏效果验收（效果好比便宜更重要）：`--limit 10` 跑完后
`sqlite3 obs.db "SELECT session_id, task_type, outcome, corrections, summary FROM observations"`
人工核对；不合格就换 llm.json 里的模型或改 distill-prompt.md，`--session` 重蒸对比。

六个视图 → practice-guide 观察清单的映射：

| 视图 | 回答的问题 |
|---|---|
| `v_skill_usage` | 哪些 skill 是死的、哪些是热的（体检第 4 象限） |
| `v_agent_spawns` | spawn 带没带显式 model（CLAUDE.md 模型纪律） |
| `v_token_economy` | 执行 token 多少跑在便宜引擎上（北极星指标） |
| `v_hook_health` | 钩子火了几次、多慢、报没报错 |
| `v_weekly_activity` | 项目 × 周的会话量与子代理量 |
| `v_session_quality` | 任务类型 × 结局 × 纠正次数（需蒸馏层） |

## 已知数据毛刺

- `hook_runs.command` 偶尔混入用户 prompt 文本（prompt 型 hook 的 hookInfos 把 prompt
  当 command 上报）——查询时 `WHERE command LIKE '%${%'` 或按长度过滤即可，不影响事实层。

## 接线（待办，见起草说明）

1. Stop hook：`hooks/hooks.json` 的 Stop 数组追加 `bun obs-enqueue.ts`（发布需 bump version）。
2. skill-atlas：体检报告新增「使用率」节，读 `v_skill_usage` / `v_agent_spawns`。
3. debrief：收盘时读本 session 的 turns/tool_calls 统计作输入。
4. 蒸馏 runner：读 queue → 拼 transcript 摘要 → 调便宜模型 → 写 observations 表（未实现）。
