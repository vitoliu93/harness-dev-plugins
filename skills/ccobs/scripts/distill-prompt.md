# ccobs 蒸馏 prompt v1（跑在便宜模型上，具体哪个由 ${CCOBS_DIR}/llm.json 决定）

每次输入一个 session 的压缩视图（用户消息全文 + 助手文本回复 + 工具调用名单，不含工具输出），
输出一行严格 JSON，写入 observations 表。效果验收：抽 10 个 session 人工核对，不合格换模型或改本 prompt。

---

你是一个会话分析器。阅读下面这份 Claude Code 会话记录，输出一个 JSON 对象，不要输出任何其他文字。

字段定义（全部必填，不确定就用 "unknown" / 0 / []）：

- `task_type`: 会话的主要任务类型，取值之一：
  `feature`（开发新功能）| `bugfix`（修 bug）| `refactor` | `research`（调研/查资料/分析）|
  `ops`（部署/发版/运维）| `config`（改配置/装工具）| `chat`（讨论/问答，没有产出物）
- `outcome`: `done`（用户明确接收或任务闭环）| `partial`（做了一半，会话结束时未完成）|
  `abandoned`（用户放弃或转向）| `unknown`
- `corrections`: 整数。用户**纠正**助手的次数——指出做错了、方向不对、要求返工、说"不是这个意思"。
  单纯的追问、补充需求不算纠正。
- `dispatch_engine`: 如果会话把整块任务外派给了 vendor CLI（/dispatch-vendors 或直接调用），写 vendor 名（如 "deepseek"、"opencode"、"cursor"），否则 null。注意：spawn subagent（Agent 工具）不算 dispatch。
- `dispatch_result`: dispatch 的结局：`ok` | `retried`（续连重派过）| `blocked`（挂起交还用户）| null（没用 dispatch）。
- `summary`: 一句中文，≤40 字，说清"这个会话做了什么、结果如何"。写给一个月后翻账本的人看。
- `learn_candidates`: 字符串数组。会话中出现的、值得沉淀为规则的教训——用户重复强调的偏好、
  助手踩过的坑、被纠正后确认的做法。没有就 []。每条 ≤30 字。
- `sop_candidate`: 会话是否走了一段**可复现的多步流程**——固定顺序的操作/检查,换个任务
  还会照做(如发版、迁移、体检类套路)。是则用 ≤20 字给流程命名,否则 null。
  一次性探索、单步操作不算。

判断规则：

1. 只依据记录本身，不要脑补。记录里没有的信息一律 unknown/null。
2. corrections 宁少勿多：模糊的不算。
3. summary 写事实，不写评价（"完成了 X" 而不是 "顺利完成了 X"）。

会话记录：

```
{{TRANSCRIPT_DIGEST}}
```
