# Context 模式：常驻上下文审计

常驻上下文会随代码无声 drift，也会堆积变臃肿。目标是去 stale，并把注意力
还给关键规则。

## 审计对象

1. 各 scope 的 `CLAUDE.md`：user（目标 ≲30 行）、project（目标 ≲200 行）、
   local、父/子目录。
2. `@` import 文件（一跳）。
3. `AGENTS.md`。
4. `~/.claude/projects/<proj>/memory/*.md` 与 `MEMORY.md`。
5. 它们之间的重复、矛盾、失效引用和 scope 错位。

## 流程

### 1. 枚举

读完所有 scope 的 CLAUDE.md，跟进 import 一跳，再读 AGENTS.md 和 memory。

### 2. 初步分类

核心问题：**删掉它，Claude 会犯错吗？**

- **keep**：正确、非重复、scope 合适，删了会犯错。
- **merge**：与其他 entry 重叠，收敛到一处。
- **drop**：过期、一次性、可从代码重推、或命中下方排除项。
- **update**：事实错误或已被 ADR / milestone 推翻。
- **relocate**：内容有用但位置错误：偶尔相关的知识/流程 → skill；零例外硬规则
  → hook；项目/用户 scope 混放 → 正确 scope；多工具共享 → AGENTS.md。

应 drop/relocate：代码里可读的事实、标准语言约定、详细 API 文档、频繁变动信息、
长教程、逐文件代码库描述、"写干净代码"等空话。

stale 信号：引用已改名文件/flag；代码状态快照；与 milestone 冲突；标待建但已完成。
keep 信号：代码里找不回的 WHY；跨仓指针；非显然硬约束；模型猜不到的命令。

### 3. Lean 评估

只在有 defect 时压缩：scope 超预算、规则因噪声被反复忽略、或命中排除项。压缩
verbose 散文和步骤，但保留 WHY。只因"能写更短"不动，避免 churn。

### 4. 假设自查（强制前置）

分类表之前列 `Assumptions that could be wrong`。每条 drop/update/merge/relocate
都写依赖假设，并标：

- ✓ 已验证：引用读过的文件、检索或 ADR，给 `file:line`；
- ✗ 未验证：不得进最终表，继续取证或降级为请用户确认。

判"两文件重复"前必须先查 symlink/hardlink（`ls -la` + inode）；内容相同不能证明
是两份文件，写穿链接会毁掉唯一真源。

### 5. 出表

列：entry 位置 / 摘要 / 分类 / 理由 / relocate 去向。**用户确认前不动手。**

### 6. 一次性落盘

- drop：删段落或 memory 文件，并清 MEMORY.md 索引；
- merge：写入保留方，再删冗余；
- update：只改失效事实，保留 WHY；
- relocate：先写目标，再删源并更新引用；
- keep：不动。

### 7. 汇报

一行报告 keep / merge / drop / update / relocate 数量、各 scope 前后行数和具体改动。

## 多工具

多工具共享时，AGENTS.md 是事实源，CLAUDE.md 只做薄 import 壳。若
`AGENTS.md -> CLAUDE.md` 已是软链，这就是单一真源，直接 keep；不要"收薄壳"写穿。

## 硬规则

- 不先出假设段和分类表就不动手。
- feedback/project memory 的 WHY 必保留。
- "老"不等于"错"，引用文件或函数先检索。
- leanness 必须由 defect 证明。
