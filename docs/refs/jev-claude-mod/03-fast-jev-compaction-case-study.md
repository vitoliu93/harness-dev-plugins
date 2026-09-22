# 案例解析：fast-jev-compaction

> 仓库：https://github.com/tamaratran/fast-jev-compaction（2026-09 创建，5640 stars）
> 本文引用的代码均来自 main 分支源码，逐段核对过。

## 它是什么

一个 Claude Code mod，替换掉原生的 `/compact` 摘要压缩：

- **原生做法**：让大模型把旧对话写成摘要。摘要是有损的——文件路径、精确报错、约束条件可能丢，而丢的往往正是后面要用的。
- **它的做法**：一个字不改写，只做删除。用一个小模型（Jev，32k 请求上限的快模型）给每个工具调用和结果打分，判定「后面用不上了」的删掉，留下的保持原文逐字不动。

一句话：**压缩 = 选择性遗忘，不是改写**。

## 仓库结构：双形态

```
fast-jev-compaction/
├── .claude-plugin/plugin.json   # 身份 + 9 个 userConfig
├── hooks/
│   ├── hooks.json               # { "modules": ["./fast-jev.ts"] }，一行
│   └── fast-jev.ts              # mod 薄壳，约 300 行，唯一入口 register
├── src/                         # 纯压缩库，不碰引擎，也是 npm 包
│   ├── compact.ts               # 主流程：配对 → 拟合 → 打分 → 判决 → 重建
│   ├── state.ts                 # 全对话状态的构建与分级截断
│   ├── request.ts               # Jev 请求构造与响应解析
│   ├── client.ts / messages.ts / types.ts
├── types/claude-code.d.ts       # 428KB，从官方仓库拷的类型声明
├── tests/
│   ├── hook.test.ts             # mod 壳的测试（不起引擎）
│   └── fast-jev-compaction.test.ts
└── tsconfig.hooks.json / tsconfig.json
```

`src/` 是可独立 `npm install` 的库（`fast-jev-compaction`），`hooks/` 是引擎适配层。逻辑与引擎分离，两边都能测。

## 骨架落地

与官方 mod 骨架一字不差：

- `plugin.json`：`name`、`version`、`description`，外加 9 个 `userConfig`（apiKey 标 `sensitive: true`，其余为数值/字符串默认值）。
- `hooks.json`：声明入口模块。
- `fast-jev.ts` 导出 `register(on, options)`，挂两个事件。
- 类型声明 vendored 进仓库——没有 npm 包时代的标准做法。

## Hook 1：`session.compact` —— 替换引擎答案

站上引擎压缩的必经之路：

```ts
on('session.compact', async ($, event, next) => {
  try {
    const config = { ...configured, apiKey: await getApiKey($, configured) }
    const { result, messages } = await compactSession(event.messages, config,
      async (url, init) => {
        const response = await $.http.fetch(url, init)
        return { status: response.status, ok: response.ok, text: response.text }
      })
    for (const line of decisionLogLines(result)) $.ui.log(line)
    if (reductionRatio(result) < config.minReductionRatio) {
      notify($, `fallback to built-in summary (below ${percent(...)} minimum)`)
      return next(event)                      // ① 删得不够多 → 退回原生摘要
    }
    notify($, `kept ${messages.length}/${event.messages.length} messages`)
    return { messages }                       // ② 交回重建的消息列表，原生摘要不发生
  } catch (error) {
    notify($, `fallback to built-in summary (...)`)
    return next(event)                        // ③ 任何失败 → 退回原生摘要
  }
})
```

三个出口，就是 `next` 链的完整语义：

| 出口 | 语义 |
| --- | --- |
| `return { messages }` | 我答完了。引擎拿这份消息列表，摘要环节被替换 |
| `return next(event)` | 我不干（失败/不值得），传给下一环——原生摘要兜底 |
| `catch` 里的 `next(event)` | 同上，但先 `$.ui.log` 告知用户降级了 |

设计判断：`minReductionRatio`（默认 0.25）——压缩率低于 25% 就不值得替换历史，宁可让引擎写摘要。**「不值得」也是一条降级路径**。

## Hook 2：`turn.complete` —— 自己掐表触发

不等引擎的自动压缩（那要等上下文涨满），每轮结束主动查：

```ts
on('turn.complete', async ($, event, next) => {
  if (compacting) return next(event)          // 防重入标志
  try {
    const { context } = await $.session.usage()
    if ((context.percent ?? 0) < configured.compactAtPercent) return next(event)
    compacting = true
    await $.session.compact()                 // 发起 session.compact 事件链
  } catch (error) {
    $.ui.log(`auto-compact skipped (...)`)
  } finally {
    compacting = false
  }
  return next(event)
})
```

要点：

- **钩子是事件的发起方**：`$.session.compact()` 触发的正是 Hook 1 挂的链。
- **阈值前置**：默认上下文 60% 才动手（`compactAtPercent`），平时零开销。
- **防重入**：`compacting` 标志挡住压缩期间新完成的回合再进来。
- 触发失败只 `ui.log`，不打断回合——这个钩子的失败无关紧要。

## `$` 遥控器用法：7 种，各有分工

| 调用 | 用途 | 备注 |
| --- | --- | --- |
| `$.http.fetch(url, init)` | 调 Jev API | 走引擎通道，可审计、可被其他插件拦 |
| `$.env.get('TYPESAFE_API_KEY')` | 读环境变量 | |
| `$.settings.read()` | 兜底读 settings 的 `env` 段 | |
| `$.session.usage()` | 查上下文百分比 | Hook 2 的触发条件 |
| `$.session.compact()` | 发起压缩 | 自触发事件 |
| `$.ui.log(...)` | 决策日志进转录 | 决策明细逐条落盘 |
| `$.ui.toast(..., { timeoutMs })` | 弹通知，15 秒 | 压缩结果一览 |

key 的读取顺序体现兜底思想：`userConfig.apiKey` → `$.env.get` → `$.settings.read()`，三层，哪层有用哪层。

## 压缩算法（`src/`，与引擎无关）

1. **配对**：每个 `tool_use` 按 `tool_use_id` 找到它的 `tool_result`。结果永远不离开调用单独存在。
2. **钉住（pin）**：首条消息 + 最近 `preserveRecentMessages` 条（默认 6）永不触碰。
3. **出考卷**：全对话按时间顺序发给 Jev，工具结果替换成短注（`ok, 4213 chars (omitted)`），调用带输入，文本带原文——不给摘要，给原件清单。
4. **拟合**：考卷塞进 `maxStateTokens`（25k）。塞不下按级截断，最老的非钉住消息先动：工具输入 1000→200→60 字符 → 长文取头尾 → 老消息折叠成省略注 → 老调用缩成一行（`t12 Read file_path=src/a.ts → ok 480ch`）。还塞不下就抛错。token 估算不用 tokenizer，用词频近似，故意略偏高。
5. **双问题**：每个非钉住调用问 Jev 两件事——`keepCall`（知道发生过这件事，还重要吗）、`keepResult`（结果原文还需要吗，重跑也拿不到才算）。多个请求并发跑，同一份状态随每个请求重发。
6. **三档判决**（`keepThreshold` 默认 0.5）：
   - `keepResult ≥ 阈值` → 调用和结果全留；
   - `keepCall ≥ 阈值` → 留调用，结果截前 `truncateHeadChars`（300）字符加一行注；
   - 都不够 → 调用连同结果删掉。
7. **重建**：内容全删光的消息移除，未触碰的消息原样保留，绝不留无调用配对的结果。

## 值得抄的工程细节

**1. 对象身份意识。** `toSessionMessages` 里，压缩没动过的消息返回引擎自己的对象（带 handle），只有重建过的才是新对象——引擎因此知道哪些没被改。和引擎交换数据，尊重它的身份标记。

**2. fail-open 全覆盖。** key 缺失、Jev 报错、答案解析失败、历史塞不进预算、压缩率不达标——五个失败路径全部汇到 `next(event)` 退回原生行为。mod 的失败不劫持用户。

**3. 测试不起引擎。** `HookFetch` 类型专门抽出 `$.http.fetch` 的形状，注释写明 "so the hook can be driven without an engine"。测试注入假 fetch。把 `$` 的依赖面收窄成接口，是 mod 可测的前提。

**4. 透明性。** 每次压缩把决策明细打上界面：`tool_id:Read:kept/call=0.92/result=0.87` 这样的逐条日志（超长分页），外加一条 toast 汇总（压缩率、留了多少条、状态 token 花费）。用户看得到删了什么、为什么。

**5. 模块级状态 + finally 复位。** `compacting` 标志防重入，`finally` 保证异常时也复位。

## 配置全景

| userConfig | 默认 | 作用 |
| --- | --- | --- |
| `compactAtPercent` | 60 | 上下文百分比到达即触发压缩 |
| `keepThreshold` | 0.5 | Jev 打分的保留线 |
| `preserveRecentMessages` | 6 | 钉住最近 N 条 |
| `minReductionRatio` | 0.25 | 压缩率低于此退回原生摘要 |
| `maxStateTokens` | 25000 | 考卷 token 预算 |
| `maxRequestTokens` | 30000 | 单个 Jev 请求上限（留 2k 给信封） |
| `truncateHeadChars` | 300 | 「留调用截结果」档保留的字符数 |
| `model` | jev-latest | Jev 模型名 |
| `apiKey` | — | 标 `sensitive: true` |

## 如果你基于它写自己的 mod

1. 保留骨架：`plugin.json` + `hooks.json` + `register`。三个文件的结构不用动。
2. 选事件：想替换某个引擎行为（摘要、审批、渲染），找到那条必经之路的 `on('事件', ...)`。
3. 保留三出口纪律：`{ 答案 }` / `next(event)` / catch + log + `next(event)`。
4. 保留可测性：把 `$.http.fetch` 的依赖抽成可注入接口。
5. 保留透明性：决策打 `$.ui.log`，结果发 `$.ui.toast`。
6. 换掉 `src/` 的算法与 API 适配层，其余照抄。

## 结论

三段论收束：大前提——mod 是站在引擎动作必经之路上的函数，用 `$` 干活，用 `next` 决定传不传；小前提——这个案例在 `session.compact` 上返回 `{ messages }` 替换引擎答案、五个失败路径全部 `next(event)` 无损降级、七种 `$` 调用各有分工；结论——它把 mod 的三个要素（站位、作答、降级）都做到了可直接照抄的程度，基于 Jev API 写新 mod 时，换掉的只有 `src/` 的打分逻辑，壳和纪律原样保留。
