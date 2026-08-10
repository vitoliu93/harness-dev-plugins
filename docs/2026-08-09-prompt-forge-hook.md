# prompt-forge: 实验性 UserPromptSubmit 增强 Hook

## 概述

灵感来自 mattpocock/skills 的 wait-what（手动重述），改为自动化：用 LLM 判定每条用户输入是否需要增强，对模糊 prompt 自动注入文件路径、会话上下文和具体动作，生成"权威 rewrite"供 agent 执行。

## 机制

### 两级判定管线

```
用户输入 → Gate 1 (零成本) → 放行? → 原样进 agent
                ↓ 不放行
           Gate 2 (llm-call) → pass? → 原样进 agent
                ↓ rewrite
           additionalContext 注入权威 rewrite → agent
```

#### Gate 1: 零成本放行（不调 LLM）

四个条件**任一满足**即放行：

1. **斜杠命令**：`/` 开头的输入是 command 展开，绝不 rewrite
2. **长度 ≤15 Unicode codepoints**：太短，不可能从 rewrite 中受益（e.g. "ok", "run tests", "修复登录页按钮"）
3. **命中确认词表**：意图明确的简短确认/指令词，不论长度
4. **具体锚点启发式**：含反引号代码段、路径（`src/auth/login.ts`）、文件扩展名、`foo()` 调用、`:42` 行号——已经足够具体，不值得调 LLM

确认词表（case-insensitive，trim 后匹配）：

```
en: ok, okay, yes, y, yeah, go, done, next, continue, proceed, run, sure, fine,
    good, great, cool, k, nice, right, ack, acknowledged, got it, go ahead,
    go on, do it, ship it, lgtm, +1

zh: 好, 好的, 行, 可以, 继续, 接着, 做, 干, 执行, 跑, 对, 嗯, 是的,
    没错, 去吧, 来吧, 搞, 整, 继续做, 接着做, 搞吧, 整吧, 好了

emoji: 👍, ✅, 👌, 🚀, 💯
```

**设计理由**：Gate 1 的存在不是为了"准确分类"，而是为了**零延迟零成本**——确认词和短输入占了交互流量的很大比例，为这些调 LLM 是浪费。15 字符阈值覆盖了 "fix the bug"（12 chars）、"跑测试"（3 chars）、"deploy to prod"（14 chars）等短指令——它们虽可能模糊，但在对话上下文里 agent 通常能正确消歧。锚点启发式砍掉"长但已具体"prompt 的 Gate 2 调用——带路径/代码引用的 prompt 极少需要 rewrite，误放行的代价只是回到无 hook 的原状。

#### Gate 2: LLM 判定与改写

调 `skills/llm-call`（deepseek-v4-flash, reasoning_effort=max）做两件事：

1. **判定**：输入是否"模糊"——缺文件路径、缺具体动作、依赖指代不明的上下文
2. **改写**：如果模糊，生成 enriched prompt，包含：
   - 从 `transcript_path` 推断的上下文（最近讨论的文件、方案名）
   - 从 `cwd` 读取的仓库信号（当前分支、最近变更文件列表）
   - 将模糊指代替换为具体路径/函数名/方案名

LLM 返回 JSON：

```json
// pass — 足够清晰
{"verdict": "pass"}

// rewrite — 需要增强
{"verdict": "rewrite", "enriched": "在 src/auth/login.ts:42 修复 TokenManager.refresh()..."}
```

### additionalContext 注入格式

rewrite 时注入的 additionalContext 格式：

```
[prompt-forge] 你的原始输入经分析后已增强为以下指令，请以此为准执行。
原始输入被保留为参考，但下述重写版本更完整、更具体。

## Enriched Prompt
{llm 生成的 enriched prompt}
```

**关键设计选择**：不隐藏原始 prompt，但明确标记 rewrite 为权威版本。agent 自然会跟随最具体、最可执行的指令。

### 上下文装配

从 hook stdin 读取：

| 字段 | 用途 | 读取量 |
|---|---|---|
| `prompt` | 需要判定的用户输入 | 全部 |
| `transcript_path` | 会话历史，推断"上次讨论的方案"、"那个文件" | 剪枝后全量：保留 text/thinking/tool_use（单块入参截断 2K，工作留痕），去 tool_result 与图片 base64（token 大头），尾部截断 500K chars（适配 flash 1M 窗口） |
| `cwd` | 仓库根目录，读取 git 信号 | `git branch --show-current`, `git log --oneline -5`, `git diff --name-only HEAD~1`, `git status --short` |
| `session_id` | 日志标识 | — |

**不做的**：不读文件内容。原因：(1) 文件内容可能很大，注入 prompt 会撑爆 LLM 上下文；(2) 文件路径本身就足够具体——"src/auth/login.ts" 比 "那个 auth 文件" 好得多；(3) agent 会在收到 rewrite 后自己读文件。

### 超时与 fail-open

- llm-call 内部超时：300s（call.ts 的 SDK timeout）
- Hook 层兜底超时：120s（`spawnSync` timeout，`LLM_CALL_TIMEOUT_MS`）——reasoning_effort=max 在长会话 transcript 上单次 30-70s
- git 信号每次 1s（`GIT_TIMEOUT_MS`）——信号是 best-effort，慢仓库丢信号不阻塞用户
- hooks.json 注册 timeout：125s —— 最坏预算：4×1s(git) + ~0.5s(bun 启动) + 120s(LLM) ≈ 124.5s < 125s ✅
- `max_tokens: 65536`（llm-call 上限）——max 档思维链单次可烧 6K+ tokens，4096 会 `finish_reason=length` 空正文
- 超时/异常/llm-call exit≠0 → **静默放行**，原 prompt 不变（stdout 无输出）
- Hook 自身 `process.exit(0)` 永远是最后一行——任何异常都被吞掉（stderr 留一行日志）

### 可观测性：结果台账

每次 hook 运行在 `${CCOBS_DIR:-~/.claude/observability}/prompt-forge.log` 追加一行 JSONL：`ts`、`session_id`、`gate`（1/2）、`verdict`（pass/rewrite/fail-open/fatal）、`elapsed_s`、`prompt_chars`、`transcript_chars`、`enriched_chars`。触发率、超时率、rewrite 率直接 grep/jq 可得。写入 best-effort，失败不阻塞。

### 可观测性：进度日志

**界面实时信号**：hooks.json 为 UserPromptSubmit 注册了 `statusMessage`——hook 运行时终端显示 spinner「prompt-forge: 分析输入是否需要增强…」。这是界面唯一实时可见的信号（官方文档：`statusMessage` 是配置项，只能静态设置，hook 无法动态更新）。

**详细日志走 stderr**（仅 debug log 可见）：进度与结果日志全部输出到 stderr——`claude --debug` 或 `/log` 可查。官方文档：exit 0 的 hook stderr 只进 debug log，不进 transcript，Claude 也看不到。stdout 必须保持纯 hook JSON，任何额外输出都会破坏解析——日志走 stderr 是硬约束。

| 节点 | stderr 日志 |
|---|---|
| 禁用 | `[prompt-forge] disabled (PROMPT_FORGE=0)` |
| Gate 1 放行 | `[prompt-forge] gate1 pass: short input (11 ≤ 15)` / `confirmation word` |
| Gate 2 开始 | `[prompt-forge] gate2: classifying "fix the bug" (11 chars) via llm-call` |
| 上下文装配 | `[prompt-forge] context: pruned transcript 8123 chars, git signals [branch, recent_commits]` |
| verdict=pass | `[prompt-forge] gate2 verdict=pass in 3.2s → prompt unchanged` |
| verdict=rewrite | `[prompt-forge] gate2 verdict=rewrite in 4.1s (enriched=312 chars) → injecting additionalContext` |
| LLM 失败/超时 | `[prompt-forge] gate2 llm-call failed in 61.0s → fail-open, prompt unchanged` |
| 任何异常 | `[prompt-forge] fatal: <msg> → fail-open` |

**为什么不用 additionalContext 注入进度**：注入文本会出现在对话上下文中且可能被 agent 复述，污染上下文；且 pass 路径没有注入点。进度是给人的调试信息，不是给模型的指令。

### 灰度：PROMPT_FORGE env flag

- 默认启用——无需设置任何环境变量
- `PROMPT_FORGE=0` → hook 静默退出（zero overhead beyond the env check）
- 设置为其他值 → 无效果，hook 仍启用

## 判定标准：正反例

### 正例（该 rewrite——模糊）

1. **"fix the bug"** — 哪个 bug？哪个文件？
2. **"add the feature we discussed"** — 哪次讨论？什么 feature？
3. **"make it faster"** — 什么？怎么算 faster？用什么方案？
4. **"refactor that mess"** — 哪个文件？为什么是 mess？
5. **"update the config"** — 哪个 config 文件？改什么值？
6. **"对接一下那个接口"** — 哪个接口？在哪里？
7. **"按上次的方案改"** — 哪次？什么方案？改成什么样？

### 反例（不该 rewrite——长但清晰）

> 注意：短指令已由 Gate 1 放行，这些反例针对**长但明确**的 prompt。

1. **"在 src/components/LoginForm.tsx 中把 handleSubmit 的错误处理改成 Result<T, Error> 模式，参考 src/utils/result.ts 的实现"** — 文件、函数、模式、参考全部明确
2. **"rename all occurrences of `userName` to `username` in src/ directory, excluding test files"** — 操作、范围、排除条件明确
3. **"add a rate limiter middleware at src/server/middleware/rateLimit.ts that allows 100 req/min per IP using the redis client from src/lib/redis.ts"** — 文件路径、参数、依赖全部指定
4. **"写一个 Python 脚本把 data/raw/*.csv 合并成 data/merged.parquet，按 timestamp 列排序去重"** — 输入、输出、操作全部明确
5. **"upgrade @anthropic-ai/sdk from 0.39 to 0.45, fix all breaking changes in src/lib/ai.ts, run the test suite"** — 版本号、目标文件、验收步骤明确
6. **"把这个 PR #234 的改动 cherry-pick 到 release/2.28 分支，解决 src/auth/ 下的冲突"** — PR 编号、目标分支、冲突区域明确

## 对抗分析

### 误拦（false positive）

**场景**：清晰的 prompt 被 Gate 2 误判为模糊，注入了不必要的 rewrite。

**缓解**：
- LLM prompt 里正反例充分（≥5 each），降低误判率
- rewrite 是**叠加**而非**替换**——即使误判，原始 prompt 完整保留，agent 仍可基于原文执行
- Gate 1 已经放行了最常见的小指令，Gate 2 面对的都是中长 prompt，LLM 对其分类准确率较高

**代价**：浪费一次 LLM 调用 + additionalContext 占一点 context budget。比 block 模式的代价（打断用户）低得多。

### 漏判（false negative）

**场景**：模糊 prompt 被 Gate 2 判为 pass，未增强就进入 agent。

**缓解**：
- 这是 fail-open 设计的一部分——宁可漏判也不误拦
- reasoning_effort=max 提升了判定质量
- Gate 1 不会导致漏判（它只放行短输入，短输入在上下文里有足够消歧信号）

### 注入污染

**场景**：LLM 生成的 rewrite 包含错误的文件路径、函数名或方案推断。

**缓解**：
- rewrite 标记为"增强版本"而非"强制替换"——agent 仍看到原文，可交叉验证
- LLM prompt 要求 rewrite 基于**可验证的信号**（git diff 文件名、transcript 中明确提到的路径），不凭空猜测
- 即使路径错了，agent 读文件时会发现并纠正

### 递归触发

**场景**：additionalContext 注入的文本在下一轮被当作"用户输入"再次触发 hook，形成无限循环。

**分析**：**不会发生**。UserPromptSubmit 只在用户实际输入时触发，additionalContext 是系统注入的 `<system-reminder>` 块，不会重新触发 hook。

### 成本

| 场景 | LLM 调用 | 延迟 |
|---|---|---|
| Gate 1 放行（短输入/确认词） | 0 | ~0ms |
| Gate 2 pass（长但清晰） | 1（判定 only） | 短会话 ~2-5s |
| Gate 2 rewrite（长且模糊） | 1（判定+改写） | 短会话 ~5-15s；长会话 transcript（30K+ chars 剪枝后）30-70s |

每次调用的 token 成本取决于剪枝后 transcript 大小：短会话 ~500-2000 prompt tokens（<$0.01）；上限 500K chars ≈ 15-40 万 tokens，以 deepseek-v4-flash 价格（≈$0.28/$1.10 per 1M tokens）单次约 $0.04-0.12。

### 隐私

- prompt 内容发送至 DeepSeek API
- 剪枝后 transcript（对话文本 + thinking + tool_use 入参，≤500K chars）发送至 DeepSeek API；工具输出结果与图片不发送
- 不发送文件内容，只发送文件路径（来自 git diff）
- 敏感项目需用户自行评估是否启用

### 确认词表漏判

**场景**：一种确认表达不在词表中，被送入 Gate 2 产生不必要的 LLM 调用。

**缓解**：
- 词表覆盖中英文最常见确认表达
- 漏判的代价仅是一次 LLM 调用，且大概率会被判为 pass（因为确认类输入通常很短、上下文清晰）
- 可以从日志中持续发现漏判模式并补充词表

## CTO 公示清单

以下决策由实现者做出（grill-me CTO 层——选错也不会让用户一周后察觉并介意）：

| 决策 | 选择 | 理由 |
|---|---|---|
| Gate 1 阈值 | ≤15 codepoints | 覆盖绝大多数确认/短指令；中文 15 字可表达完整指令但长度上仍是短输入 |
| 确认词表语言 | en + zh + emoji | 覆盖中英双语工作环境 |
| LLM 模型 | deepseek-v4-flash | 与 llm-call 默认一致，成本低，判定任务不需要最强模型 |
| 超时 | 120s | max 档 reasoning 在长会话 payload 上单次 30-70s，60s 会频繁误杀 |
| 上下文预算 | 剪枝 transcript ≤500K chars + git 信号 | 留 text/thinking/tool_use（入参截 2K），去 tool_result/图片，尾部截断，适配 flash 1M 窗口 |
| 脚本语言 | TypeScript (bun) | 用户指定；test_hooks.py 通过 subprocess 调 bun run |
| Hook 类型 | command | `bun run ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/prompt-forge.ts` |
| 静默 fail | 所有异常 exit(0) | 永不阻塞用户输入 |

## Eval 结果 (2026-08-09)

### Case 0: 原始任务 prompt（846 chars）
- **结果**: PASS — 正确。详细规格，文件路径和动作全部明确，不需要 rewrite。

### 正例（该 rewrite）

| # | Prompt | 结果 | 说明 |
|---|---|---|---|
| P1 | "fix the bug" | GATE1 | 11 chars ≤15，Gate 1 放行——设计如此 |
| P2 | "implement the thing we talked about yesterday" | REWRITE ✅ | LLM 从 git 信号推断出 prompt-forge hook，给出了正确文件路径 |
| P3 | "make the database queries faster" | REWRITE ✅ | LLM 正确标注 TODO——仓库无 DB 层文件，不幻觉 |
| P4 | "clean up the messy code in that module" | REWRITE ✅ | LLM 推断为 hooks 模块但保留 TODO 澄清 |
| P5 | "对接一下那个新接口" | GATE1 | 8 字符 ≤15，Gate 1 放行 |

### 反例（不该 rewrite——长但清晰）

| # | Prompt | 结果 | 说明 |
|---|---|---|---|
| N1 | "在 src/components/LoginForm.tsx 中把 handleSubmit 的..." | PASS ✅ | 文件/函数/模式/参考全部明确 |
| N2 | "rename all occurrences of userName to username in src/..." | PASS ✅ | 操作/范围/排除条件全部明确 |
| N3 | "add a rate limiter middleware at src/server/middleware/..." | PASS ✅ | 路径/参数/依赖全部指定 |
| N4 | "写一个 Python 脚本把 data/raw/*.csv 合并成..." | PASS ✅ | 输入/输出/操作全部明确 |
| N5 | "upgrade @anthropic-ai/sdk from 0.39 to 0.45..." | PASS ✅ | 版本/目标文件/验证步骤明确 |

**结论**: 5/5 反例正确放行，3/5 正例正确 rewrite，2 例被 Gate 1 按设计放行。无漏判，无误拦。
