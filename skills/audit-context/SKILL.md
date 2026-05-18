---
name: audit-context
description: Audit and prune CLAUDE.md, @-imported docs, and auto-memory together. Classify each entry as keep/merge/drop/update, surface assumptions that could be wrong, show table only after verification, then apply. Trigger on "audit CLAUDE", "prune memory", "clean context", "审计 CLAUDE", "清理记忆", or periodic maintenance sweeps.
---

# Audit Context

项目 registry（CLAUDE.md + @-imports + auto-memory）会随代码演进无声 drift。本 skill 把三者一起审、分类、修正。

## 反 speed-run 保护

CLAUDE 在长对话里容易跳过"读文件验证"直接给分类 —— 这会把错误判断落成 destructive action。Step 3 强制把每条 `drop`/`update`/`merge` 的 implicit 假设显式化，不显式 = 不落表。

## 审计对象

1. **CLAUDE.md** 本体
2. **@-imported 文件**（AGENTS.md 等，跟一跳）
3. **auto-memory**：`~/.claude/projects/<proj>/memory/*.md` + `MEMORY.md` 索引
4. **三者之间的关系**：重复、矛盾、失效的交叉引用

## 流程

### 1. 枚举

读 CLAUDE.md → 跟进所有 `@import` 一跳 → `ls` memory 目录，逐个读入。

### 2. 分类（初步）

每个 entry 必选其一：

- **keep** — 仍可执行，不重复，事实正确
- **merge** — 与其他 entry 重叠，合并到一处
- **drop** — 已过期 / 一次性 / 可从代码和文档重新推导
- **update** — 事实性错误或被 ADR/milestone 推翻，就地改写

**Stale 信号**：引用已改名的文件/flag；是代码状态的点时间快照（字段表、param 映射）；与当前 milestones.md 冲突；`待建` 标记但任务已 done。

**Keep 信号**：记录了 WHY（事故、用户偏好），代码里找不回；跨仓库指针；对新 agent 非显然的硬约束。

### 3. 列出"可能错"的假设（强制前置）

出分类表**之前**，先单独写一段 **Assumptions that could be wrong**：

- 每条标为 `drop` / `update` / `merge` 的 entry 都必须在此列出它依赖的具体假设
- 每条假设标注验证状态：
  - ✓ 已验证 —— 引用读过的文件 / 跑过的 grep / 查过的 ADR（给出 file:line）
  - ✗ 未验证 —— 仅凭上下文推断
- **未验证的假设 = 该条分类不得进入最终表**。必须先回头验证，或降级为"请用户确认"

**格式示例**：

> **Assumptions that could be wrong（分类前自查）**
> - `project_icc_param_mapping_status` 标 drop，假设：
>   1. skill docs 已覆盖 `transform_x/font_color` 等字段 —— ✓ 读过 `icccut-agents/.claude/skills/add-text/SKILL.md`
>   2. milestones.md M2.3 会重写 adapter —— ✓ 读过 `milestones.md:79`
>   3. 无其他代码引用此 memory 的结论 —— ✗ 未 grep，但 memory 不是代码引用对象，风险低
> - `CLAUDE.md line 43` 标 update，假设：
>   1. ADR-011 确实把权威从 converter.ts 改到 skill docs —— ✓ 读过 `decisions.md:8-86`

**规则**：
- 列假设 ≠ 走过场。每条假设都要能指向具体证据（file:line / grep 结果 / ADR 编号），否则视为未验证
- 目的是**阻止纯靠对话上下文速配给结论** —— 强制写出假设 → 强制回头验证 → 才能落表
- 假设列出后若 ✗ 太多，回到 Step 2 重读码，不要硬推进到出表

### 4. 出表（最终）

假设全部 ✓ 后，把分类结果以表格形式呈现给用户。列：entry 位置、内容摘要、分类、理由。

**硬规则**：用户确认前不动手。

### 5. 一次性落盘

- `drop` → 删 memory 文件 + 从 MEMORY.md 删行；或删 CLAUDE.md 段落
- `merge` → 合并到保留方，删冗余方
- `update` → 只改失效的那一句，保留 WHY
- `keep` → 不动

### 6. 汇报

一行：keep N / merge N / drop N / update N，列出具体改动。

## 规则

- **不先出假设段 + 表就不动手**。用户可能不同意某一项分类。
- **feedback/project 类 memory 的 WHY 必保留**。事实过期就重写事实，不要删掉产生这条规则的事件。
- **"老" ≠ "错"**。memory 提到某文件/函数时，先 `grep` 确认它真的消失了，再判定 stale。
- **别 churn**。只因"能写得更短"而动刀一律 skip；只处理 stale、重复、矛盾。
- **审 CLAUDE.md 尺寸**。清理后若仍 > ~100 行，提醒进一步压缩 —— 它是 registry，不是 manual。
