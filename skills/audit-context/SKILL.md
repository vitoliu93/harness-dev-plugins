---
name: audit-context
description: Audit and prune the always-loaded context — CLAUDE.md, @-imports, auto-memory. Use when "audit CLAUDE/prune memory/清理记忆" or periodic sweeps.
---

# Audit Context

每次会话开场就被加载的"常驻上下文"会随代码无声 drift，也会随手堆积变臃肿。本 skill 把它们一起审：分类 → 验证假设 → 出表 → 落盘。

常驻上下文 = 注意力预算。多一行没用的，就稀释一分真正重要的指令 —— 臃肿的 CLAUDE.md 会让 Claude **直接忽略**你真正在乎的规则（rule lost in the noise）。所以审计有两个目标：**去 stale**（错的/过期的）和**变 lean**（把注意力还给关键规则）。

## 反 speed-run 保护（本 skill 的核心，不可省）

长对话里 Claude 容易跳过"读文件验证"直接给分类 —— 这会把错误判断落成 destructive action。Step 4 强制把每条 drop/update/merge/relocate 的 implicit 假设显式化、指向证据，不显式 = 不落表。

## 审计对象

1. **CLAUDE.md（按 scope 分层审，各有预算）**
   - **user** `~/.claude/CLAUDE.md` —— 跨项目通用：编码哲学、语言/包管理偏好、隐私默认。每个 session 都加载，预算最紧（目标 ≲ 30 行）。
   - **project** `./CLAUDE.md` —— 本仓库专属：build/test 命令、code style、repo etiquette、架构决策、env 怪癖、非显然 gotcha。入 git。目标 ≲ 200 行。
   - **local** `./CLAUDE.local.md` —— 个人项目笔记，gitignore。
   - 父/子目录的 CLAUDE.md（monorepo 会被自动/按需拉入）。
2. **@-imported 文件**（跟一跳）
3. **AGENTS.md**（见末节"多工具"）
4. **auto-memory**：`~/.claude/projects/<proj>/memory/*.md` + `MEMORY.md` 索引
5. **彼此关系**：重复、矛盾、失效交叉引用、scope 错位

## 流程

### 1. 枚举
读所有 scope 的 CLAUDE.md → 跟进每个 `@import` 一跳 → 读 AGENTS.md（若有）→ `ls` memory 目录逐个读入。

### 2. 分类（初步）—— 用 litmus test 裁决

**每条的核心问题：删掉它，Claude 会犯错吗？** 不会 → 不该留在常驻上下文里。

每个 entry 必选其一：
- **keep** —— 留则有用、删则犯错；不重复、事实正确、在对的 scope。
- **merge** —— 与其他 entry 重叠，合并到一处。
- **drop** —— 过期 / 一次性 / 可从代码和文档重新推导 / 命中下方 ❌ 清单。
- **update** —— 事实错误或被 ADR/milestone 推翻，就地改写。
- **relocate** —— 内容有用但**放错地方**，白占每-session 预算：
  - 只是偶尔相关的领域知识/工作流 → 挪去 **skill**（按需加载）。
  - 必须每次零例外执行的硬规则 → 挪去 **hook**（确定性执行，非 advisory）。
  - 项目专属内容混进 user scope，或反之 → 挪到对的 scope。
  - 多工具团队的共享内容 → 收敛到 AGENTS.md（见末节）。

**Anthropic 的 ❌ 别放清单**（命中即 drop 或 relocate）：代码里读得到的东西；模型已知的标准语言约定；详细 API 文档（改成链接）；频繁变动的信息；长篇解释/教程；逐文件的代码库描述；"写干净代码"这类不言自明的废话。

**Stale 信号**：引用已改名的文件/flag；是代码状态的点时间快照（字段表、param 映射）；与当前 milestones 冲突；标 `待建` 但任务已 done。

**Keep 信号**：记录了 WHY（事故、用户偏好），代码里找不回；跨仓库指针；对新 agent 非显然的硬约束；Claude 猜不到的 Bash 命令。

### 3. Lean 评估（变 lean，但**只在有 defect 时**动刀）

leanness 不是免费动作，要被 defect 证成 —— 否则就是 churn。判"太臃肿"只在以下任一成立：
- 该 scope **超预算**（user ≳30 行 / project ≳200 行）；
- 有**证据**某条规则因被淹没而被忽略（本次对话里 Claude 反复违反一条确实写了的规则）；
- 内容命中上方 ❌ 清单。

满足时才做：
- verbose 散文压成 terse 指令；用 declarative 成功标准替代 step-by-step 流程。
- **压缩 ≠ 删 WHY**：留住承载信息和理由，只砍冗词。
- 仍 keep 的内容若只是"能写更短" → 不动，这是 churn。

### 4. 列出"可能错"的假设（强制前置）
出分类表**之前**，先单独写一段 **Assumptions that could be wrong**：
- 每条 drop / update / merge / relocate 都列出它依赖的具体假设。
- 每条标验证状态：✓ 已验证（引用读过的文件 / 跑过的 grep / 查过的 ADR，给 file:line）；✗ 未验证（仅凭上下文推断）。
- **未验证的假设 = 该条分类不得进最终表**。回头验证，或降级为"请用户确认"。

**格式示例**：
> **Assumptions that could be wrong（分类前自查）**
> - `project_icc_param_mapping_status` 标 drop，假设：
>   1. skill docs 已覆盖 `transform_x/font_color` 等字段 —— ✓ 读过 `add-text/SKILL.md`
>   2. 无其他代码引用此结论 —— ✗ 未 grep，但 memory 非代码引用对象，风险低
> - `CLAUDE.md L43` 标 relocate→skill，假设：该工作流只偶尔相关 —— ✓ 全仓 grep 仅 2 处命中

**规则**：列假设 ≠ 走过场，每条要能指向证据（file:line / grep / ADR 编号）；✗ 太多就回 Step 2 重读码，别硬推进出表。

### 5. 出表（最终）
假设全部 ✓ 后，把分类结果表格呈现。列：entry 位置 / 内容摘要 / 分类 / 理由 /（relocate 注明去向）。**硬规则：用户确认前不动手。**

### 6. 一次性落盘
- drop → 删段落 / 删 memory 文件 + 删 MEMORY.md 行
- merge → 并入保留方，删冗余方
- update → 只改失效那一句，保留 WHY
- relocate → 先写进目标（skill / hook / 别的 scope / AGENTS.md），再从原处删，更新交叉引用
- keep → 不动

### 7. 汇报
一行：keep N / merge N / drop N / update N / relocate N，附每个 scope 清理前后行数，列出具体改动。

## 多工具（AGENTS.md）

若仓库同时服务 claude / cursor / codex（如 vito 的 `.agents`）：Claude Code 至今**不原生读 AGENTS.md**，但 cursor/codex/copilot 等读它。推荐形态：
- **AGENTS.md = 唯一事实源**（build/test/style/gotcha），被所有工具读。
- **CLAUDE.md = 薄壳**：`See @AGENTS.md` + 仅 Claude 专属的少量补充。
审计时发现 CLAUDE.md 与 AGENTS.md 各写一份重叠内容 → 标 merge/relocate，收敛到 AGENTS.md，CLAUDE.md 只留 import。

## 规则
- **不先出假设段 + 表就不动手**。用户可能不同意某项分类。
- **feedback/project 类 memory 的 WHY 必保留**。事实过期就重写事实，别删掉产生这条规则的事件。
- **"老" ≠ "错"**。提到某文件/函数时先 grep 确认它真没了，再判 stale。
- **leanness 要被 defect 证成**。只因"能写更短"而动刀 = churn，skip；只处理 stale / 重复 / 矛盾 / 超预算 / scope 错位 / 命中 ❌ 清单。
- **litmus test 是最终裁判**：删它，Claude 会犯错吗？
