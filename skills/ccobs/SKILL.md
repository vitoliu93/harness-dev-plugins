---
name: ccobs
description: >-
  agent 工具可观测账本：Claude Code / codex / droid / grok / opencode 五源
  session 统一灌入 SQLite，出 7 个观测视图（工具分布、skill 使用率、agent
  模型纪律、token 经济、hook 健康度、项目周活、语义质量）。触发：「观测报告」
  「usage report」「各工具用量」「工具分布」「codex 用量」「哪些 skill 没人用」
  「token 花在哪了」「agent 有没有带 model」「ccobs」，或 skill-atlas/debrief
  要使用率与会话统计。不负责语义记忆检索和实时监控。
---

# ccobs — agent observability ledger

三层架构：**原始账本（各工具自己的 JSONL/SQLite，保留期后蒸发）→ SQLite 事实层
（SQL 提取，永久）→ observations 语义层（便宜模型蒸馏，永久，仅 claude-code）**。
DB 是派生索引：删库随时可重建（`rm ~/.claude/observability/obs.db* && bun
scripts/ingest.ts`），但已被各工具保留期删掉的原始文件不可恢复——launchd 每日
兜底跑，且累积的历史行数会多于当下可重建数，属正常。运行时 bun（`bun:sqlite`
内置，零依赖）；install.sh 会自动装 bun。

## 数据模型：source 记 harness，model 记 engine

工具（harness）和模型（engine）是两个正交维度。`sessions.source` 记录是哪个
工具产生的会话，`turns.model` 记录每个 turn 实际消费的模型。dscode/arkcode
（CC 二进制指向 deepseek/ark）的会话 source='claude-code'，靠 model 区分引擎。

```sql
-- fine-tune 我的 Claude Code 用法：只看 claude 模型
WHERE s.source='claude-code' AND t.model LIKE 'claude-%'
-- 各工具怎么分配：第一眼看总览
SELECT * FROM v_tool_overview;
-- deepseek 总共花了多少 token（不管从哪个工具）
WHERE t.model LIKE 'deepseek%'
```

## 五个采集源

| source | 原始位置 | 增量机制 | tokens | skill/subagent |
|---|---|---|---|---|
| claude-code | `~/.claude/projects/**/*.jsonl` | 字节偏移 + Stop hook 队列 | ✅ 每 turn | ✅ |
| codex | `~/.codex/sessions/**/rollout-*.jsonl` | 字节偏移 | ✅ token_count 事件 | subagent ✅ / skill 恒 NULL |
| droid | `~/.factory/sessions/*/*.jsonl` + `.settings.json` | 字节偏移 | ❌ | ✅（Skill/Task 工具） |
| grok | `~/.grok/sessions/<enc-cwd>/<uuid>/` | events 字节偏移 + summary 重读 | ❌ | subagent ✅（spawn_subagent） |
| opencode | `~/.local/share/opencode/opencode.db` | time_updated 水位线（只读打开） | ✅ 每 message + cost | ✅（skill/task part） |

`project` 键全源统一为 CC 目录编码（`cwd.replaceAll('/','-')`），跨源
`GROUP BY project` 直接可用；原始路径在 `cwd` 列。hook 是 claude-code 独占
事实，`hook_runs` 只有 claude-code 数据。

## 布局

- DB / 队列 / 日志：`~/.claude/observability/`（`CCOBS_DIR` 可覆盖）
- `scripts/schema.sql` — 表 + 7 个视图，views 即报告（视图用 DROP+CREATE，改定义后跑一次 ingest 即生效）
- `scripts/ingest.ts` — 五 adapter 增量、幂等灌库（单文件注册表模式）
- `scripts/obs-enqueue.ts` — Stop hook：只 append 一行到 queue.jsonl，毫秒级
- `scripts/install.sh` — macOS(arm) 启动器：自动装 bun + launchd 每小时（灌库→蒸馏，RunAtLoad 开机补跑）+ 首次灌库
- `scripts/distill-prompt.md` / `scripts/distill.ts` — 语义蒸馏（仅 claude-code；provider 解析：
  `~/.claude/observability/llm.json` 显式覆盖优先，否则按 DEEPSEEK > GEMINI > OPENROUTER >
  LMSTUDIO 取第一个有 `*_API_KEY` 的；launchd 不继承 shell env——install.sh 把安装时在场的
  key 烤进 plist，轮换 key 后重跑 install.sh）

## 用法

```bash
# 换新机器 / 首次安装
bash scripts/install.sh

# 手动灌库（增量，秒级；首次即全量回填）
bun scripts/ingest.ts                # 全部五源
bun scripts/ingest.ts --source codex # 单源调试
bun scripts/ingest.ts --project kox  # 只扫匹配的 claude 项目目录（隐含 --source claude-code）
bun scripts/ingest.ts --queue        # 只消费 Stop hook 队列（claude-code）

# 看报告（七个视图任选）
sqlite3 -header -column ~/.claude/observability/obs.db "SELECT * FROM v_tool_overview"

# 语义蒸馏（需先配 llm.json；launchd 每晚也会自动跑）
bun scripts/distill.ts --dry-run / --limit 5 / --session <id>
```

七个视图 → 回答的问题：

| 视图                | 回答的问题                                       |
| ------------------- | ------------------------------------------------ |
| `v_tool_overview`   | 我在各工具上怎么分配（每源一行，含数据完整性自检）|
| `v_skill_usage`     | 哪些 skill 是死的、哪些是热的（source 维度）     |
| `v_agent_spawns`    | spawn 带没带显式 model（model 纪律仅 claude 有意义）|
| `v_token_economy`   | token 花在哪个 model × kind × source（北极星）   |
| `v_hook_health`     | 钩子火了几次、多慢、报没报错（claude-code 独占） |
| `v_weekly_activity` | 项目 × 周 × source 的会话量与子代理量            |
| `v_session_quality` | 任务类型 × 结局 × 纠正次数（蒸馏层，claude-code）|

## 已知数据毛刺

- `hook_runs.command` 偶尔混入用户 prompt 文本（prompt 型 hook 上报毛病）——查询时
  `WHERE command LIKE '%${%'` 或按长度过滤。
- droid / grok 无 token 数据；其 model 是 session 级快照（settings.json / summary.json），
  session 中途换模型会失真。
- codex 的 skill 列恒 NULL（无离散事件，宁缺毋假）；增量续读的断块处 turn model 可能 NULL。
- grok 的 ts 精度是微秒（其他源毫秒），字符串比较仍正确。
- 蒸馏效果验收：`--limit 10` 跑完后抽查 observations 表；不合格换 llm.json 模型或改
  prompt，`--session` 重蒸对比。

## 加新源三步（Claude Desktop / Codex app 大概率共用现有存储，先验证格式再动手）

1. ingest.ts 里写一个 `{name, discover, ingest}` 对象注册进 `ADAPTERS`——JSONL 源复用
   字节偏移模式（合成 ID 必须用**绝对**字节位置 `offset + pos`），SQLite 源复用水位线模式（只读打开）。
2. 缺失字段诚实置 NULL，不猜不估；hook_runs 不写。
3. `project` 必须 `encodeProject(cwd)`；session 起止时间聚合事件 ts。

## cursor 系不灌库，现场查询指引

cursor-agent 和 cursor-ide 数据保真度低（无 token、blob 需解码）且格式脏，刻意不做
adapter。要查时直接去原始库：

- **cursor-agent**：`~/.cursor/chats/<workspace-md5>/<session-uuid>/store.db`，两张表——
  `meta`（key/value，JSON 含 agentId / name / mode / createdAt / lastUsedModel）、
  `blobs`（id/data，data 是 JSON bytes 的消息节点 role/content，从 meta 的
  latestRootBlobId 下钻）。`sqlite3` 直读即可。
- **cursor-ide**：`~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
  （2GB+），`cursorDiskKV` 表的 `composerData:*`（会话）与 `agentKv:blob:*`。只按 key
  点查，别全表扫。

## 接线（待办）

1. Stop hook：`hooks/hooks.json` 的 Stop 数组追加 `bun obs-enqueue.ts`（发布需 bump version）。
2. skill-atlas：体检报告新增「使用率」节，读 `v_skill_usage` / `v_agent_spawns`。
3. debrief：收盘时读本 session 的 turns/tool_calls 统计作输入。
