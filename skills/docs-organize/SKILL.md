---
name: docs-organize
description: 开发文档体检:按「文档—事实—代码」锚点修/删/合并,收敛进 docs/ 并维护索引。仅用户点名时触发("整理文档/docs organize");agent 不得主动发起(包括"周期性维护"——等用户叫)。
argument-hint: "[audit | adopt]"
---

# docs-organize

文档会随代码无声 drift：位置散、内容旧、版本重、真假混。本 skill 做两件事：**audit**（一次性体检：核验 → verdict 表 → 分级执行 → 重建索引）和 **adopt**（把 placement 约定落进 workspace，让日常 session 写文档时自动走对位置）。audit 结束自动包含 adopt。

## 核心模型：文档—事实—代码

**事实是一切的核心。** 每份文档必须有锚点——它锚定的事实来源：代码路径 / issue（Gitee 等）/ 需求（或它本身就是需求的 starting point）。无锚点 = 孤儿。文档与事实冲突时，**代码和运行时是裁决者**：文档说谎比没有文档更糟。

## 文档五分类（各有事实规则）

| 类型 | 判别 | 事实规则 |
| --- | --- | --- |
| **活文档** | 描述"现状"（现状总览、字段表、环境归属、Runbook） | 必须与代码一致：核验失真 → fix；骨架性失真（描述的机制已不存在）→ delete/重写 |
| **快照类** | dated 方案/决策记录（"YYYY-MM-DD 定稿"、方案 vN） | 本身是历史事实，代码演进≠删除理由；被新版取代 → 移 `_archive/`，不改写 |
| **参考资料** | pdf/pptx/厂商大 HTML，外部知识的本地副本 | 不核验内容，只问"还被需要吗" → `references/` 或预删 |
| **临时/handoff** | 跨 session 交接、一次性审计产物 | handoff 类 → 全局 `~/tmp/`（见 handoff skill）；一次性 dump → 项目 `tmp/`（纯 scratch，随时可清）或预删 |
| **非项目文档** | 与本 workspace 任何需求都不发生联系（学习材料、面试题） | 外迁 `~/Documents/claude-code/docs/`，workspace 里零容忍 |

## Placement 约定（adopt 落地的内容）

`$ROOT` 解析同 advanced-plan：git 仓 → 仓根；multi-repo workspace（CWD 是各仓的非 git 公共父目录）→ workspace 目录本身。

```
$ROOT/docs/
  README.md            # 唯一入口：头部 = 本约定，正文 = 索引（一行一文档：链接 + 一句"讲什么、何时必读"）
  *.md / *.html        # 活文档 + 快照类，平铺——索引即导航，不建主题目录树
  references/          # pdf/pptx/厂商参考资料
  _archive/            # 被取代的快照类
  advanced-plans/      # advanced-plan/debrief 所有（目录名是历史约定），本 skill 不碰内部
  incidents/           # 事故记录（若有）
```

三句硬规则（adopt 时写进 `docs/README.md` 头部，$ROOT/CLAUDE.md 的 docs 索引段落改成指针 + 这三句）：

1. 新文档只许落 `$ROOT/docs/`（跨仓/全局的）或对应子仓（单仓强相关的，跟代码走）；落地即在 `docs/README.md` 登记一行。子仓必读文档也用相对链接登记进中央索引。
2. 临时/handoff 类上全局 `~/tmp/`，不进 `docs/`，不进项目 `tmp/`。
3. 非项目文档不落 workspace，直接去 `~/Documents/claude-code/docs/`。

## audit 流程

### 1. Inventory

扫 `$ROOT` 顶层散落文件 + `docs/` + `tmp/`（multi-repo workspace 时子仓内部不进本次范围，只登记必读级进索引）。按扩展名（md/html/pdf/pptx）收文档，逐份初判五分类，并按标题/关键词/同一 issue 锚点**聚类重复簇**。

### 2. 核验（fan-out 给 dscode，控成本）

只核验活文档 + 快照类。每份文档一个独立核验任务，**并行 `dscode`（DeepSeek flash）执行，不 spawn Claude subagent**：

```bash
dscode -p "<核验 brief>" --model deepseek-v4-flash --output-format json
```

（dscode 继承 claude settings 的默认 model，不显式 `--model` 会落到贵的 pro slot——必须传。限流时 failover `arkcode`，同参数。）

核验 brief 模板（主会话拟定，worker 只取证不裁决内容去留）：

> 读 <doc 路径>。**实证前先 `git -C <相关代码目录> fetch` 并与 origin/<集成分支> 比对**——本地检出可能落后，落后时以 origin 内容为准（2026-07-11 首跑因此产生假阳性失真判定）。然后抽出其中可实证的声明（文件路径/表名/字段/端点/配置键/命令/流程顺序），每条用 grep/ls 在 <相关代码目录> 实证。若文档引用 issue 编号，报告编号原文。返回 JSON：{claims: [{claim, probe, hit: true|false, evidence: "file:line"}], summary}。只取证，不评价。

主会话汇总各 worker 结果 → 逐份定 verdict：
- **代码锚点**：命中率高 + 个别失真 → fix（列出改哪几处）；骨架性失真 → delete/重写。
- **issue 锚点**：经 gitee-operator（或对应平台）查存在与状态；issue 已关但文档仍"进行中"口吻 → 归档候选；issue 不存在 → 按孤儿处理。
- **快照类**：只判"是否被更新版本取代"，不验代码一致性。
- **孤儿**（无任何锚点）：非项目 → 外迁；临时 → 预删；**像项目相关但找不到锚点 → 单独列出问用户**（锚点可能只在用户脑中，误删代价最高）。

### 3. Verdict 表（destructive 动作的唯一入口）

一张表列全量，无表外隐式删改。每行：文件 | 分类 | verdict（keep/fix/merge/move/archive/delete）| 锚点 | 证据/理由。

重复簇的 merge 语义：
- **版本链型**（v1/v2/定稿同源迭代）→ 留最新，旧正式稿 → `_archive/`，中间草稿 → delete。
- **散片型**（同主题互补）→ 合并成一份：以核验通过的声明为准，冲突以代码实证裁决；**合并稿由主会话亲自拟**（内容创作不下放），表中写明"合并进谁、各取哪部分、丢弃什么"。

### 4. 分级执行

- **批量档**（一次确认全执行）：move（进 references/、_archive/、外迁）、明显垃圾 delete（无锚点过期 dump、被取代的中间草稿）、handoff 迁 `~/tmp/`。
- **逐条档**（一条条过用户）：活文档 fix/重写、散片 merge、拿不准的孤儿。
- workspace 级 `docs/` 通常不在 git 里，删无兜底——delete 永远先过表，宁可多归档少硬删。

### 5. 收尾

重写 `docs/README.md`（头部约定 + 全量索引），改 `$ROOT/CLAUDE.md` 的 docs 索引段（指针 + 三句硬规则），报告：动了什么、外迁了什么、留了哪些待用户逐条决定的。

## adopt 流程（单独触发时）

不体检存量，只做：建目录骨架（`references/`、`_archive/`）→ 写 `docs/README.md` 头部约定（已有索引内容保留）→ 改 CLAUDE.md 指针段。

## 边界（不越界）

- `docs/advanced-plans/` 内部：advanced-plan + debrief 所有。
- auto-memory / CLAUDE.md 常驻上下文本体：audit-context 所有（本 skill 只动它的 docs 索引段）。
- 子仓内部文档：不进 v1 audit 范围，单独跑时以该仓为 `$ROOT` 再来一次。
- 远端团队仓的过时内容：报告里标注，不代改。
