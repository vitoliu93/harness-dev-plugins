# Claude Mod 介绍

> 信息来源：anthropics/claude-code 仓库 `mods/` 目录、`mods/types/claude-code.d.ts`、官方 issue #91870。
> 整理时间基于 2026-09 的 main 分支状态。

## 一句话

Claude Mod 是一种用 TypeScript 函数直接修改 Claude Code 内部行为的插件：每个函数挂在引擎的一个事件上，能看、能改、能拦、能换答案。

## 它解决什么问题

旧版 hooks 的能力边界：在 settings.json 里配 shell 命令，事件发生时起一个子进程，通过 stdin/stdout 传 JSON。三个硬限制：

1. 只能「通知 + 放行/拦截」，改不了事件内容，改不了界面。
2. 子进程模型，每次事件起进程，慢且无状态。
3. 插件之间互不相识，无法组合。

Function hooks（产品名 Claude Mods）把插件搬进 Claude Code 进程内，用函数代替命令，把引擎的每个动作变成可拦截的事件。官方计划把现有功能逐步迁移成 mod 形态——`mods/` 目录里的四个内置 mod 就是第一批。

## 三个核心概念

### 1. 事件无处不在

引擎的每个动作都走同一条事件管道。会话开始、装配上下文、调用工具、渲染界面、压缩内存——全部是事件。完整清单见 `claude-code.d.ts` 的 `EventOf` 类型，约 125 个。

### 2. 事件是一条链，位置决定权力

每个事件按顺序穿过一串插件，洋葱模型：

```
组织 prepend 层 → 用户装的插件 → 组织 append 层 → 引擎本体
```

钩子函数签名 `($, e, next)`，三种回答：

- `next(e)` —— 改完传给下一环。`e` 可以是改过的副本。
- `{ deny: '理由' }` —— 拦下，这步不做。
- 直接返回自己的答案（如 `{ messages }`、`{ result }`）—— 代替引擎本体作答。

特例：`next.to(e, 'append')` 跳过中间所有环，只有管理层插件有权调用。

### 3. `$` 是引擎递给你的遥控器

钩子跑在引擎进程里，副作用必须通过 `$`：

- `$.ui.log(...)` 界面输出
- `$.http.fetch(...)` 网络请求
- `$.session.usage()` 会话状态
- `$.fs.read(...)`、`$.store.get(...)`、`$.clock.now()` ……

这是刻意设计：副作用全走 `$`，引擎知道哪个插件在什么时候动了什么。每个工具钉着 `e.provider` 标明来路，安全体系建立在这上面。

## 新旧对照

| | 旧 hooks | Function hooks / Mods |
| --- | --- | --- |
| 写法 | JSON 配 shell 命令 | TypeScript 函数 |
| 跑在哪 | 独立子进程 | 引擎进程内 |
| 能力 | 通知 + 放行/拦截 | 改事件、改回复、改 UI、装新能力 |
| 顺序 | 谁配谁算 | 固定分层，链式传递 |
| 可观测 | 引擎不知道 | 全走 `$`，引擎全程记账 |

## 名词（noun）：mod 之间的插座

mod 可以给 `$` 装新零件。内置的 telemetry mod 装了 `$.telemetry`，别的 mod 直接调。规则：

- 零件的形状写在 mod 自己的 `types/index.d.ts`，同时声明到 `EngineInterface`。
- 实现的返回值对着契约检查，不许漂移。
- 调用方从契约文件 import 类型，不许复制。
- 测试时用 inline plugin 装一个假 provider 顶位。

`engine.create` 事件就是装机现场：想给 `$` 加零件的 mod 在这个事件里返回零件。

## 事件地图（三类，约 125 个）

### 引擎事件（38 个）

| 组 | 事件 |
| --- | --- |
| 工具 | `tool.call`、`tool.check`、`tool.describe` |
| 提示词 | `prompt.submit`、`prompt.section`、`prompt.context`、`prompt.fill`、`prompt.suggest`、`prompt.edit`、`prompt.attachment` |
| 回合 | `turn.start`、`turn.step`、`turn.complete` |
| 会话 | `session.start`、`session.end`、`session.compact`、`session.receive`、`session.attach`、`session.detach`、`session.measure` |
| 界面 | `ui.render`、`ui.resolve`、`ui.press`、`ui.input`、`ui.select`、`ui.message`、`ui.scroll`、`ui.focus` |
| 命令 | `command.run`、`command.describe` |
| 子代理 | `agent.offer`、`agent.spawn` |
| 配置 | `config.set`、`config.describe` |
| 杂项 | `skill.prompt`、`attribution.text`、`plugin.register`、`engine.create` |

### classic.*（33 个）

旧 shell hooks 的每个事件在链上有一个 `classic.<名字>` 镜像：`classic.PreToolUse`、`classic.PostToolUse`、`classic.UserPromptSubmit`、`classic.SessionStart`、`classic.Stop`、`classic.PreCompact`、`classic.PermissionRequest`……共 33 个。链的顺序固定为：managed settings hooks → hooks modules → 其余 settings hooks（core）。

### `$` 调用（54 个）

平时是钩子里调的 API，每次调用本身也走事件链——别的插件可以拦、改答案、拒答：

- 模型：`model.complete`、`model.classify`、`model.fork`
- 音频：`audio.play`、`audio.speak`
- MCP：`mcp.call`
- 会话：`session.cwd/root/model/turns/id/messages/repo/surface/surfaces/authorize/usage`、`turn.abort`、`prompt.read`
- 注册表：`tool.list/register`、`command.list/register`、`config.list`、`agent.list/register`
- UI：`ui.toast/status/log/notice/invalidate/open/close/panes/blit`
- 文件：`fs.read/write/list/exists/stat/ancestors`
- 存储：`store.get/set/delete/keys`
- 时钟：`clock.now/sleep/after/every`
- 外联：`http.fetch`、`process.run`、`settings.read`、`env.get/set`

事件名会随版本增减。真源永远是拷下来的 `claude-code.d.ts`。

## 安全模型

- 分层固定：组织的 prepend/append 层包住用户的 user 层。
- 内置 mod `sec-default` 坐在最外层：把组织的 classic hooks、managed CLAUDE.md、设置、MCP 白名单挡在用户层插件之外，用户层插件碰不到。它自己不添加任何策略。
- fail closed：策略读不到按「有策略」处理。
- 每个 hook 有时间预算（`HookBudget`，`next.budget` 可读），等 `next` 和 `$` 的时间不算自己的。

## 现状与风险

1. **Early access**。开启需要环境变量 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`，不开则 hooks 模块完全不加载。
2. **没有官方文档页**。文档站尚未收录（404）。事实上的文档是仓库本身：`mods/README.md`、各 mod 的 README、`mods/types/claude-code.d.ts`、会话内 `/plugin-types` 命令。
3. **API 会破坏性变更**。官方明说接口可能在版本间无预警变动，不承诺兼容。
4. **不在插件市场**。内置 mod 不上架；第三方 mod 目前靠目录分发 + 对方自己挂载。

## 信息源清单

| 来源 | 用途 |
| --- | --- |
| https://github.com/anthropics/claude-code/tree/main/mods | 内置 mod 源码，四个现成例题 |
| `mods/types/claude-code.d.ts` | API 真源，约 50 万字节类型声明 |
| issue #91870 | 官方公告帖，含架构 PDF 与速查表 |
| 会话内 `/plugin-types` | 生成当前版本的实际类型声明 |
| `claude --plugin-dir mods/diff` | 从源码跑一个 mod |
