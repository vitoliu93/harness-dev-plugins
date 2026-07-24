# Spec 模板与 context pack

按档位伸缩，防官僚化注水。设计依据见
`docs/2026-07-23-coding-agent-orchestration-design.md` §4.2–4.3。

## S 档（默认）

```yaml
goal:                 # 一句话行为目标
files_owned:          # writes glob（并发求交用）
allowed_extra_writes: # writes glob 外允许触碰的白名单（回验越界用）
acceptance_cmds:      # 见下方 schema；其涉及的文件即受保护验收文件,worker 只读
out_of_scope:         # 越界清单，显式列"别碰"
escalate_when:        # 何时停手上报（而不是自由发挥）
```

## L 档（追加，用于契约类/跨仓任务；feature 类强制）

```yaml
interface_contract:   # verbatim 签名 + 错误语义，host 先行冻结
invariants: []        # 不变量清单（host 契约抽查的靶子）
naive_failure_mode:   # host 自答"最可能的偷懒实现"——兼作异族审查种子
context_pack_refs: [] # 项目层只读资产引用
budget: {max_tokens: , max_retries: }
reads_contracts: []   # 只读依赖的契约文件
needs: []             # db / dev_server / 对象存储 等共享资源（加锁，并行度=1）
```

## 验收命令逐条 schema

```yaml
- id:
  cmd:                 # 机器可判，exit code 说话
  baseline_expect:     # FAIL | N/A(纯回归)——派发前 pre-red gate 验证
  anti_fake:           # 独立确证信号（如 tsc --listFiles、pytest collected 数）
  fixture_min:         # 最小 fixture 要求
  provenance:          # spec | escaping:<issue_id>（防误删）
```

## spec lint（零模型，入队前跑）

模糊词表命中即 judgment-point，未逐条消解不可入队：
`合理|适当|必要时|顺手|风格一致|优雅|干净|尽量|酌情`。
词表从账本失败案例回流扩充。

## context pack（manifest 化，不是散文）

- **三层**：任务层 = spec（host 手写 delta）｜项目层 = house style/模块
  拓扑/勘察结论（只读缓存，跨委派复用）｜会话层 = 本需求已拍板决策（追加式）。
- 文件清单 = `{path, line_ranges, content_sha}`；勘察资产带
  `{generated_at_sha, covers_glob}`，diff ∩ covers_glob 非空即 [STALE]
  强制重勘察。
- 风格约束给**正负样例对**（真实代码 + "别这样写因为 X"），不给抽象规则。
- 跨仓隐性约定（镜像语义、"改 X 前必读"）蒸馏进每仓 pack，随 spec 强制附上。
- 硬 token 预算 ~12-15k；装不下 = 任务太大或判断没收敛，一票否决。

## 派前 probe（~2k token，上下文失败检测前移）

worker 只答三问：改哪些文件 / 从哪个入口下手 / 验收怎么跑。与 host 的
writes 集比对——错位 = 补上下文重 probe（≤2 次）→ 仍错位 = 改路由。

## spec 对抗审查（打断 spec-验收同头相关性）

派异族**便宜**模型，输入只有 spec+验收命令，固定 prompt："你是想偷懒的
coder，列 3 种能过全部验收但不满足意图的实现 + 对应补验收命令"。
host 一分钟决定采纳哪条。高风险任务必跑，成本极小。
