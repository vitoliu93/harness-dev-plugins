# Claude Mod 开发 Cookbook

> 前置阅读：`01-claude-mod-intro.md`。本文全部命令与代码基于 2026-09 官方仓库验证。
> 核心参考实现：`fast-jev-compaction`（案例见 `03`），官方 `mods/diff`、`mods/agents-md`。

## 0. 前提

```bash
claude --version   # 需要 /plugin-types 可用的新版本（约 2.1.263+）
```

所有环节带环境变量，否则 hooks 模块不加载：

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
```

## 1. 骨架：三个必需文件

```
my-mod/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── register.ts
└── types/              # 从官方仓库拷贝
```

**`.claude-plugin/plugin.json`**

```json
{
  "name": "my-mod",
  "version": "0.1.0",
  "description": "What it does"
}
```

**`hooks/hooks.json`**

```json
{
  "description": "One line for the registry",
  "modules": ["./register.ts"]
}
```

**`hooks/register.ts`** —— 唯一入口，最小可用：

```ts
import type { On, PluginOptions } from 'claude-code'

export function register(on: On, options: PluginOptions): void {
  on('session.start', ($, e, next) => {
    $.ui.log(`my-mod: session started in ${e.cwd}`)
    return next(e)
  })
}
```

心智模型一句话：`on('事件名', ($, e, next) => ...)`。返回 `next(e)` 放行；返回 `{ deny: '理由' }` 拦截；返回自己的答案代替引擎作答。

## 2. 接入类型声明

`import type ... from 'claude-code'` 目前没有 npm 包。两条路：

**路 A（当前最稳）：从官方仓库拷**

```bash
curl -o types/claude-code.d.ts \
  https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts
```

**路 B：会话里跑 `/plugin-types`**，生成当前版本的实际声明。官方方向是让它自动写进已装插件旁边。

**`tsconfig.json`**（照抄官方 mods/tsconfig.json 的 compilerOptions）

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "types": [],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "jsx": "react",
    "jsxFactory": "h",
    "jsxFragmentFactory": "Fragment"
  },
  "include": ["types", "hooks", "tests"]
}
```

注意 `jsx: react` + `jsxFactory: h`：UI 树是真的 React 风格组件树，`ui.render` 事件能整棵换掉。

## 3. 跑起来

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir /path/to/my-mod
```

官方自己就这么跑源码版：`claude --plugin-dir mods/diff`。

## 4. 测试

**`tests/register.test.ts`** 的机制：

- 测试拿到引擎自己的 `$` 和插件的 `on`。
- `$` 上的每次调用必须有人答：用 `on('事件名', ...)` 注册假答案。没人答的调用直接报错并点名事件。
- `tier(...)` 声明插件所在层（内置 mod 用 `tier('builtin')`，第三方用 `tier('user')`）。
- `mock.clock(on)`、`mock.env(on, {...})`、`mock.store(on, {...})` 分别顶替 `$.clock`、`$.env`、`$.store`。

```ts
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

describe('register', () => {
  test('logs the session cwd', async ($, on) => {
    const logs: string[] = []
    on('ui.log', ($, e) => { logs.push(e.text ?? ''); return { value: undefined } })

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    expect(logs.some(l => l.includes('/work'))).toBe(true)
  })
})
```

事件字段名以手头版本的 `.d.ts` 为准，不要照抄示例。

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test /path/to/my-mod
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 npx tsc -p .
```

## 5. 配方集

### R1 拦工具调用（工具卫士）

```ts
on('tool.call', async ($, e, next) => {
  if (e.tool === 'Bash' && /rm -rf/.test(JSON.stringify(e.input))) {
    return { deny: '不许删库' }
  }
  return next(e)
})
```

参考：[mods/sec-default](https://github.com/anthropics/claude-code/tree/main/mods/sec-default)——deny/pass/跳层三种回答的官方示范。

- `{ deny }` 拒绝；`{ result }` 自己代答，工具本体不跑。
- managed settings hooks 排在最前，它的 deny 就是最终结果。
- 返回时若 `next` 还没跑完，底下在跑的链会被中止。

### R2 只拦特定工具（matcher）

参考：`claude-code.d.ts` 里 `tool.check` 的 `@example`。

```ts
on('tool.check', { tool: 'Read' }, () => ({ decision: 'allow' }))
```

matcher 作为 `on` 的第二参数，字段匹配才进入钩子。matcher 在 dispatch 入口绑定一次，事件对象 `e` 按引用传递——钩子里改 `e` 会影响后续环节，先拷贝再改。

### R3 改模型看到的上下文

```ts
on('prompt.section', ($, e, next) => {
  return next({ ...e, sections: [...e.sections, { kind: 'text', text: '团队规约……' }] })
})
```

`agents-md` mod 用 `prompt.context` 把 AGENTS.md 塞进指令文件列表，引擎像对待 CLAUDE.md 一样渲染它。参考：[mods/agents-md](https://github.com/anthropics/claude-code/tree/main/mods/agents-md)。

### R4 替换引擎答案

```ts
on('session.compact', async ($, e, next) => {
  const messages = await myCompact(e.messages)
  return { messages }          // 引擎的摘要不发生了
})
```

关键差异：`next(e)` 是「传下去」，直接返回值是「我答完，链到此为止」。替换答案 = 后者。

### R5 自触发事件

参考：fast-jev 的 `turn.complete`（见案例文档 Hook 2 段）。

```ts
on('turn.complete', async ($, e, next) => {
  const { context } = await $.session.usage()
  if ((context.percent ?? 0) > 60) await $.session.compact()  // 触发 session.compact 链
  return next(e)
})
```

钩子可以当事件的发起方。加布尔标志防重入（见 `03` 案例）。

### R6 配置与敏感信息

`plugin.json` 里声明 `userConfig`，用户在插件设置里填，`options` 参数读到：

```json
{
  "userConfig": {
    "apiKey":   { "type": "string", "sensitive": true },
    "threshold": { "type": "number", "default": 0.5 }
  }
}
```

读取时三层兜底：`options.apiKey` → `$.env.get('...')` → `$.settings.read()`。密钥标 `sensitive: true`。

### R7 跨事件状态

参考：[mods/diff](https://github.com/anthropics/claude-code/tree/main/mods/diff)——把用户的对比 base 选择按仓库存在插件 store 里。

```ts
let state = { count: 0 }                       // 模块级变量，进程内有效
await $.store.set('my-mod:count', 1)           // 引擎托管的持久存储
const v = await $.store.get('my-mod:count')
```

会话内小状态用模块变量；要跨会话或被引擎管理用 `$.store`。

### R8 优雅降级（fail-open）

```ts
try {
  return { messages: await riskyWork(e.messages) }
} catch (err) {
  $.ui.log(`fallback (${err instanceof Error ? err.message : String(err)})`)
  return next(event)
}
```

原则：mod 失败时退回引擎原生行为，别让用户卡死在你的 bug 上。例外：安全类 mod（学 `sec-default`）要 fail closed。

## 6. 陷阱清单

| 陷阱 | 说明 |
| --- | --- |
| 变量忘开 | 没设 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` 时 hooks 模块静默不加载，一切「没生效」先查这个 |
| `next()` 调两次 | 副作用跑两遍。一个钩子一个出口 |
| 直接改 `e` | 事件对象按引用传，下游会看到你的改动。`next({ ...e, ... })` 拷贝后再改 |
| matcher 绑定时机 | matcher 在 dispatch 入口绑定一次，不在每次钩子执行时重新求值 |
| 忽略对象身份 | 返回引擎数据时，未改动的对象原样返回（带着 handle），只新建改过的 |
| 返回错形状 | 字段形状不对的答案会让钩子被跳过——静默失效，靠测试兜住 |
| 时间预算 | 每个 hook 有预算（`next.budget`），等 `next`/`$` 不算自己的，自己里别 sleep |
| 版本漂移 | API 无兼容承诺，升级 Claude Code 后重跑 `tsc` 和测试 |

## 7. 分发现状

- mods 不进插件市场。分发 = 把目录给对方 + 对方 `--plugin-dir` 挂载 + 对方自己开环境变量。
- 内置 mod 不上架，「算数的副本」是编译进二进制的那份。
- 等 feature 转正后走 marketplace，装的人也免开变量。

## 8. 交付前检查清单

- [ ] 三个必需文件齐全，`plugin.json` 的 `name` 唯一
- [ ] `types/claude-code.d.ts` 拷好，`tsc -p .` 零错误
- [ ] 每个钩子有且只有一个出口（`next` 或直接返回，不并存）
- [ ] 所有副作用走 `$`，没有裸调 Node API
- [ ] 失败路径有降级（`next(event)` 或明确拒绝），并 `$.ui.log` 告知用户
- [ ] 测试里 `$` 的每个调用都有假答案，`claude plugin test` 通过
- [ ] 敏感配置标 `sensitive: true`，读取有环境变量与 settings 兜底
- [ ] README 写清：挂哪个事件、改什么、怎么降级

## 9. 参考链接

### 官方（anthropics/claude-code）

| 链接 | 内容 |
| --- | --- |
| [mods/](https://github.com/anthropics/claude-code/tree/main/mods) | 内置 mod 源码总目录，最好的例题集 |
| [mods/README.md](https://github.com/anthropics/claude-code/blob/main/mods/README.md) | mod 定义、测试机制（`claude plugin test`、mock、tier）、noun contracts |
| [mods/types/claude-code.d.ts](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts) | API 真源，直接下载：`curl -o types/claude-code.d.ts https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts` |
| [mods/tsconfig.json](https://github.com/anthropics/claude-code/blob/main/mods/tsconfig.json) | compilerOptions 模板（本文第 2 节照抄处） |
| [mods/agents-md](https://github.com/anthropics/claude-code/tree/main/mods/agents-md) | R3 参考：`prompt.context` 改上下文 |
| [mods/sec-default](https://github.com/anthropics/claude-code/tree/main/mods/sec-default) | R1 参考：deny 语义与安全层 |
| [mods/diff](https://github.com/anthropics/claude-code/tree/main/mods/diff) | R7 参考：`$.store`、UI 面板 |
| [mods/telemetry](https://github.com/anthropics/claude-code/tree/main/mods/telemetry) | noun 参考：给 `$` 装新零件 |
| [.github/workflows/mod-tests.yml](https://github.com/anthropics/claude-code/blob/main/.github/workflows/mod-tests.yml) | CI 里怎么开环境变量、跑 `claude plugin test` |
| [issue #91870](https://github.com/anthropics/claude-code/issues/91870) | 官方公告帖：设计动机、架构 PDF、启用变量的出处 |
| [架构 PDF](https://github.com/user-attachments/files/31802150/EXTERNAL.Function.Hooks.Core.Architecture.pdf) | function hooks 核心架构文档 |

### 官方文档站（无 function hooks 页面，以下是相邻主题）

| 链接 | 内容 |
| --- | --- |
| [Claude Code docs](https://code.claude.com/docs/en/overview) | 文档站入口；function hooks 尚未收录（404） |
| [Hooks reference](https://code.claude.com/docs/en/hooks.md) | 旧版 shell hooks——`classic.*` 33 个事件的原始定义 |
| [Create plugins](https://code.claude.com/docs/en/plugins.md) | 插件体系：plugin.json、marketplace，mod 的承载框架 |

### 案例（tamaratran/fast-jev-compaction）

| 链接 | 内容 |
| --- | --- |
| [仓库](https://github.com/tamaratran/fast-jev-compaction) | 案例主页，npm 包 + mod 双形态 |
| [hooks/fast-jev.ts](https://github.com/tamaratran/fast-jev-compaction/blob/main/hooks/fast-jev.ts) | R4/R5/R6/R8 参考：两个 hook 的完整实现 |
| [.claude-plugin/plugin.json](https://github.com/tamaratran/fast-jev-compaction/blob/main/.claude-plugin/plugin.json) | R6 参考：9 个 userConfig，`sensitive: true` |
| [tests/hook.test.ts](https://github.com/tamaratran/fast-jev-compaction/blob/main/tests/hook.test.ts) | 不起引擎的 hook 测试写法 |

### 配套阅读（本目录）

- `01-claude-mod-intro.md` —— 概念与事件全景
- `03-fast-jev-compaction-case-study.md` —— 案例逐段解析
