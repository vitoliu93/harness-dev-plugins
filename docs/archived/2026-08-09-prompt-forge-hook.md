> 已于 2026-09-05 移除（v2.54.0）。一个月台账：每句中等长度输入先等 20 秒（中位），改写只是主 agent 已有信息的子集，Codex 端读不到 transcript。原因见当日会话复盘。

# prompt-forge: 实验性 UserPromptSubmit 增强 Hook

## 概述

灵感来自 mattpocock/skills 的 wait-what（手动重述），改为自动化：用 LLM 判定每条用户输入是否需要增强，对模糊 prompt 自动注入文件路径、会话上下文和具体动作，生成"权威 rewrite"供 agent 执行。

## 机制

### 两级判定管线

```
用户输入 → Gate 1 (零成本) → 放行? → 原样进 agent
                ↓ 不放行
           Gate 2 (pi)       → pass? → 原样进 agent
                ↓ rewrite
           additionalContext 注入权威 rewrite → agent
```

#### Gate 1: 零成本放行（不调 LLM）

五个条件**任一满足**即放行：

1. **斜杠命令**：`/` 开头的输入是 command 展开，绝不 rewrite
2. **长度 ≤6 Unicode codepoints**（先剔除全部空白，不只是首尾）：太短，不可能从 rewrite 中受益（e.g. "ok", "跑测试", "再试一次"）
3. **命中确认词表**：意图明确的简短确认/指令词，不论长度
4. **具体锚点启发式**：含反引号代码段、路径（`src/auth/login.ts`）、文件扩展名、`foo()` 调用、`:42` 行号——已经足够具体，不值得调 LLM
5. **带图输入**：含 `[Image #N]` 占位符。hook 收到的 `prompt` 只有占位符，base64 在 transcript 的 image block 里，而当前这轮在 hook 运行时尚未落盘——分类器看不到刚贴的那张图，改写只能凭空补内容。上一轮及更早的图另行处理，见「视觉路由」

确认词表（case-insensitive，trim 后匹配）：

```
en: ok, okay, yes, y, yeah, go, done, next, continue, proceed, run, sure, fine,
    good, great, cool, k, nice, right, ack, acknowledged, got it, go ahead,
    go on, do it, ship it, lgtm, +1

zh: 好, 好的, 行, 可以, 继续, 接着, 做, 干, 执行, 跑, 对, 嗯, 是的,
    没错, 去吧, 来吧, 搞, 整, 继续做, 接着做, 搞吧, 整吧, 好了

emoji: 👍, ✅, 👌, 🚀, 💯
```

**设计理由**：Gate 1 的存在不是为了"准确分类"，而是为了**零延迟零成本**——确认词和极短输入占了交互流量的很大比例，为这些调 LLM 是浪费。阈值取 6 而非更高：中文密度高，15 个码点是一整句话（"把那个配置清理一下顺便更新文档" 正好 15），而那正是最该被增强的模糊 prompt；确认类输入由词表单独覆盖，不依赖长度。锚点启发式砍掉"长但已具体"prompt 的 Gate 2 调用——带路径/代码引用的 prompt 极少需要 rewrite，误放行的代价只是回到无 hook 的原状。

#### Gate 2: LLM 判定与改写

经 `skills/ccobs/scripts/pi-call.ts` 调 pi（模型由 `llm.json` 的 `prompt-forge` 键决定）做两件事：

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

**关键设计选择**：不隐藏原始 prompt。措辞是"可作为执行依据"而非"以此为准"，并附一句"如与仓库实际不符，以仓库实际为准"——改写是对意图的展开，不是对仓库的断言。

### 两种改写契约

按 transcript 有无切换，二者共用分类骨架，只换 sourcing 规则：

| | evidence 模式（有 transcript） | no-evidence 模式（无 transcript） |
|---|---|---|
| git 信号 | 装配进 payload，作背景 | **整个不装配** |
| 允许写路径 | 只能写 prompt 或 transcript 里逐字出现过的 | 一个都不许写 |
| 判定依据 | 是否缺具体目标、指代是否可解 | 动作 / 对象 / 范围 / 完成条件是否完整 |
| 产出形态 | 解指代，替换成具体目标 | 只扩写措辞，目标按角色描述，未知处打 `TODO: clarify` |

no-evidence 模式下 git 信号是被**扣留**而非被劝阻的：`changed_files` 讲的是仓库最近做了什么，和用户现在想要什么是两回事，把它放进 payload 就是在邀请模型把前者冒充成后者。约束可以被无视，缺失不能。

### 视觉路由

hook 拿到的 transcript 逐字节等于「当前这轮之前的全部内容」，所以刚粘贴的图取不到，但**上一轮的图能取到**——而那正是追问句（"这个按钮改一下"、"右边那块间距别扭"）指向的对象。

- 回溯窗口按**用户轮**计，不按 JSONL 条目：一次 assistant 工作循环写几十条 tool_use/tool_result，按条目计的窗口够不到图。取最近 2 个用户轮，最多 2 张，单张上限 4M base64 chars，扫描行数硬上限 300
- 命中且 `OPENROUTER_API_KEY` 存在 → 该次请求路由到 `openai/gpt-5.6-luna`（OpenRouter），图片以 `image_url` content block 随 prompt 一起发；否则维持默认 provider 的纯文本路径
- 台账记 `vision` 与 `images`

prompt 自带 `[Image #N]` 的仍在 Gate 1 放行：用户指的是刚贴的那张，把上一轮的图喂进去比不喂更糟。

### 出处校验

改写产出注入前，正则抽出其中的路径 token，逐个比对语料——**语料是「原 prompt + 剪枝后 transcript」，不含 git 信号**（信号正是伪造路径的来源，拿它校验等于不校验）。有任何一个对不上，整条改写作废，原 prompt 原样放行，台账记 `verdict: "discarded"` 与 `unsourced` 清单。

误杀是可接受的：transcript 丢弃了 tool_result，只在 grep/glob 输出里出现过的路径会被判无出处。作废即 fail-open，代价是零。

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

- 模型无内部超时：pi 没有 `--timeout`，只有下面这一层
- Hook 层兜底超时：90s（`LLM_TIMEOUT_MS`，pi-call 自己 kill 子进程）——高思考档单次 4-70s 且长尾明显；90s 不损失台账里任何一次 rewrite，更紧的档（45s/30s）开始丢有效改写
- git 信号每次 1s（`GIT_TIMEOUT_MS`）——信号是 best-effort，慢仓库丢信号不阻塞用户
- hooks.json 注册 timeout：125s —— 最坏预算：4×1s(git) + ~0.5s(bun 启动) + 90s(LLM) ≈ 94.5s < 125s ✅
- 输出长度不再设上限：pi 没有 `max_tokens` 开关，由模型自身的 max-out 决定
- 超时/异常/pi 返回空 → **静默放行**，原 prompt 不变（stdout 无输出）
- Hook 自身 `process.exit(0)` 永远是最后一行——任何异常都被吞掉（stderr 留一行日志）

### 可观测性：结果台账

每次 hook 运行在 `${CCOBS_DIR:-~/.claude/observability}/prompt-forge.log` 追加一行 JSONL：`ts`、`session_id`、`gate`（1/2）、`verdict`（pass/rewrite/discarded/fail-open/fatal）、`elapsed_s`、`prompt_chars`、`transcript_chars`、`mode`（evidence/no-evidence）、`cwd`、`prompt_on_disk`、`enriched_chars`、`unsourced`。触发率、超时率、rewrite 率直接 grep/jq 可得。写入 best-effort，失败不阻塞。

`prompt_on_disk` 记录 hook 运行时当前这轮是否已写入 transcript：`null` = 没有 transcript 文件，`false` = 文件在但本轮尚未落盘。它同时回答两件事——带图输入能否取到图，以及哪些会话全程读不到历史。

### 可观测性：进度日志

**界面实时信号**：hooks.json 为 UserPromptSubmit 注册了 `statusMessage`——hook 运行时终端显示 spinner「prompt-forge: 分析输入是否需要增强…」。这是界面唯一实时可见的信号（官方文档：`statusMessage` 是配置项，只能静态设置，hook 无法动态更新）。

**详细日志走 stderr**（仅 debug log 可见）：进度与结果日志全部输出到 stderr——`claude --debug` 或 `/log` 可查。官方文档：exit 0 的 hook stderr 只进 debug log，不进 transcript，Claude 也看不到。stdout 必须保持纯 hook JSON，任何额外输出都会破坏解析——日志走 stderr 是硬约束。

| 节点 | stderr 日志 |
|---|---|
| 禁用 | `[prompt-forge] disabled (PROMPT_FORGE=0)` |
| Gate 1 放行 | `[prompt-forge] gate1 pass: short input (11 ≤ 15)` / `confirmation word` / `image attached` |
| Gate 2 开始 | `[prompt-forge] gate2: classifying "fix the bug" (11 chars) via pi` |
| 上下文装配 | `[prompt-forge] context: pruned transcript 8123 chars, git signals [branch, recent_commits]` |
| verdict=pass | `[prompt-forge] gate2 verdict=pass in 3.2s → prompt unchanged` |
| verdict=rewrite | `[prompt-forge] gate2 verdict=rewrite in 4.1s (enriched=312 chars) → injecting additionalContext` |
| 出处校验作废 | `[prompt-forge] gate2 rewrite cites unsourced paths [src/login.ts] → discarded, prompt unchanged` |
| LLM 失败/超时 | `[prompt-forge] gate2 pi call failed in 61.0s → fail-open, prompt unchanged` |
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
| LLM 模型 | `llm.json` 的 `prompt-forge` 键 | 换模型改配置即可，不改代码；判定任务不需要最强模型 |
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
