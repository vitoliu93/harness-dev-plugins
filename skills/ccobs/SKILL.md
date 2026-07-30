---
name: ccobs
description: >-
  构建或查询 agent 可观测账本 obs.db；采集七种 CLI/IDE、统计 session/tool/token，或读取
  Cursor IDE/Agent 的 message_parts 会话正文时使用。非 Cursor 正文仍在原始 JSONL/SQLite。
---

# ccobs — agent observability ledger

三层架构：**原始账本（各工具自己的 JSONL/SQLite，保留期后蒸发）→ SQLite 证据层
（统计事实 + Cursor 消息明细，永久）→ observations 语义层（便宜模型蒸馏，永久，仅
claude-code）**。
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

## 七个采集源

| source | 原始位置 | 增量机制 | tokens | 正文明细 | skill/subagent |
|---|---|---|---|---|---|
| claude-code | `~/.claude/projects/**/*.jsonl` | 字节偏移 + Stop hook 队列 | ✅ 每 turn | ❌（蒸馏时临时读） | ✅ |
| codex | `~/.codex/sessions/**/rollout-*.jsonl` | 字节偏移 | ✅ token_count 事件 | ❌ | subagent ✅ / skill 恒 NULL |
| droid | `~/.factory/sessions/*/*.jsonl` + `.settings.json` | 字节偏移 | ❌ | ❌ | ✅（Skill/Task 工具） |
| grok | `~/.grok/sessions/<enc-cwd>/<uuid>/` | events 字节偏移 + summary 重读 | ❌ | ❌ | subagent ✅（spawn_subagent） |
| opencode | `~/.local/share/opencode/opencode.db` | time_updated 水位线（只读打开） | ✅ 每 message + cost | ❌ | ✅（skill/task part） |
| cursor-ide | `~/Library/.../Cursor/.../state.vscdb`（只读打开） | composerData.lastUpdatedAt 水位线 | ❌（字段在但≈全 0，非零才记） | ✅ `message_parts` | ❌（无 skill 概念） |
| cursor-agent | `~/.cursor/chats/*/*/store.db` + `meta.json` | meta.json updatedAtMs 水位线 | ❌ | ✅ `message_parts` | ❌ |

`project` 键全源统一为 CC 目录编码（`cwd.replaceAll('/','-')`），跨源
`GROUP BY project` 直接可用；原始路径在 `cwd` 列。hook 是 claude-code 独占
事实，`hook_runs` 只有 claude-code 数据。

## 布局

- DB / 队列 / 日志：`~/.claude/observability/`（`CCOBS_DIR` 可覆盖）。这个目录是
  全部 agent 运行记录的共同家:ccobs 的库、dispatch 账本、compaction 日志、
  skill-atlas 产物都在这儿——**动态记录一律不落源码仓**。例外是临时且跨 CLI 的
  中转件(handoff → `~/tmp/`):它们不是账本,也不该锁在 Claude 自己的目录里
- `message_parts.content/data_json` 含原始 prompt、thinking、工具参数/结果，可能夹带
  凭证、绝对路径和业务数据；只在本机查询，对外复制或分享前必须脱敏。
- `scripts/schema.sql` — 统计表、Cursor `message_parts` 明细表 + 7 个视图，views 即报告（视图用 DROP+CREATE，改定义后跑一次 ingest 即生效）
- `scripts/ingest.ts` — 七 adapter 增量、幂等灌库（单文件注册表模式）；每次运行（手动或 launchd）
  append 一行带时间戳的 summary 到 `~/.claude/observability/ingest.log`
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
bun scripts/ingest.ts                       # 全部七源
bun scripts/ingest.ts --source codex        # 单源调试
bun scripts/ingest.ts --source cursor-ide   # IDE 正文增量/首次回填
bun scripts/ingest.ts --source cursor-agent # Agent 正文增量/首次回填
bun scripts/ingest.ts --project kox         # 只扫匹配的 claude 项目目录（隐含 --source claude-code）
bun scripts/ingest.ts --queue               # 只消费 Stop hook 队列（claude-code）

# 看报告（七个视图任选）
sqlite3 -header -column ~/.claude/observability/obs.db "SELECT * FROM v_tool_overview"

# 语义蒸馏（需先配 llm.json；launchd 每晚也会自动跑）
bun scripts/distill.ts --dry-run / --limit 5 / --session <id>
```

## 主动同步（model 按需触发）

launchd 每小时兜底、Stop hook 每会话入队——但**很近的会话**（今天刚结束、还没到下一个
整点）可能尚未灌库。要立刻确认某会话已收录（recall 前、或核对一次刚结束的任务），model
可直接触发一次增量灌库：**安全、幂等、秒级、随时可重复跑**，不必等那一小时。

脚本路径用 `${CLAUDE_SKILL_DIR}`——Claude Code 在 skill 载入时把它替换成本 skill 的真实
绝对目录（个人/项目/plugin cache 都对），跟 CWD 无关。ingest.ts 内部全程 homedir 锚定
（DB、七源原始库），从任何目录跑都对：

```bash
# 全量增量，最稳（七源都扫，只读新字节）
bun ${CLAUDE_SKILL_DIR}/scripts/ingest.ts
# 只消费 Stop hook 队列（最便宜的准实时路径）
bun ${CLAUDE_SKILL_DIR}/scripts/ingest.ts --queue
# 找不到脚本（没装 ccobs）= 当作没数据，别报错
```

跑完核对是否已收录：`sqlite3 ~/.claude/observability/obs.db "SELECT ended_at FROM sessions WHERE session_id LIKE '%<id>%'"`。

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
- cursor-ide：bubble 的 ISO `createdAt` 已写入 turn/tool/message part；token 字段虽在但≈全
  0（0 视为缺失记 NULL）；有权威 header 顺序时，assistant model 会从最近的 user bubble
  继承，无顺序则诚实留 NULL；约六成 composer 无 workspace 归属 → project='unknown'；
  不在 header 的分支/孤儿 bubble 仍收录但 `seq=NULL`；`agentKv:blob:*`（新版 Agent 的
  二进制块）未解析，只有落入 `bubbleId:*` 的正文会进库。
- cursor-agent：`message_parts` 保存 system/user/assistant/tool 的 text、reasoning、工具参数
  和结果；model 是会话级快照（meta 的 lastUsedModel）；消息顺序仍在 protobuf 链里，未解析
  时 `seq/ts=NULL`（`part_index` 只保证单条消息内部顺序），且库中分支/孤儿 JSON blob 也
  可能被收录；少数 store.db SQLITE_CANTOPEN，跳过、下轮重试；cwd 从 user 消息的
  `Workspace Path:` 提取，提不到 → 'unknown'。

## 加新源三步（Claude Desktop / Codex app 大概率共用现有存储，先验证格式再动手）

1. ingest.ts 里写一个 `{name, discover, ingest}` 对象注册进 `ADAPTERS`——JSONL 源复用
   字节偏移模式（合成 ID 必须用**绝对**字节位置 `offset + pos`），SQLite 源复用水位线模式（只读打开）。
2. 缺失字段诚实置 NULL，不猜不估；hook_runs 不写。
3. `project` 必须 `encodeProject(cwd)`；session 起止时间聚合事件 ts。

## cursor 系正文查询

两个 Cursor adapter 会把本地可读取的消息内容写入 `message_parts`：`content` 放
text/reasoning/字符串工具结果，`data_json` 放结构化工具参数、结果和来源元数据。

```sql
-- 先按来源、项目和时间定位 session；IDE id 是 composerId，Agent id 是目录 UUID
SELECT session_id, source, cwd, started_at, ended_at
FROM sessions
WHERE source IN ('cursor-ide', 'cursor-agent')
ORDER BY ended_at DESC;

-- 某会话正文；IDE 有 seq，Agent 尚未解 protobuf 顺序链时 seq 为 NULL
SELECT seq, part_index, role, part_type, tool_name, content, data_json
FROM message_parts WHERE session_id = '<session-id>'
ORDER BY seq IS NULL, seq, part_index;

-- 看各源正文覆盖率（source 从 sessions 关联）
SELECT s.source, p.role, p.part_type, COUNT(*)
FROM message_parts p JOIN sessions s USING(session_id)
GROUP BY s.source, p.role, p.part_type;
```

`v_tool_overview` 等七个视图继续只覆盖统计事实；正文覆盖率使用上面的
`message_parts JOIN sessions` 查询。

原始来源仍是最终依据：Cursor Agent 的 `store.db` protobuf 链可用于确认 active branch 和
严格顺序；Cursor IDE 的 `state.vscdb` 还含尚未解析的 `agentKv:blob:*`。升级旧版 ccobs 后
首次 Cursor ingest 会用版本化水位线自动全量回填正文，库体积会明显增大；之后恢复增量。

## 接线（待办）

1. Stop hook：`hooks/hooks.json` 的 Stop 数组追加 `bun obs-enqueue.ts`（发布需 bump version）。
2. skill-atlas：体检报告新增「使用率」节，读 `v_skill_usage` / `v_agent_spawns`。
3. debrief：收盘时读本 session 的 turns/tool_calls 统计作输入。
