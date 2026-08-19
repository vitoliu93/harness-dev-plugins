---
name: context-audit
description: >-
  Audit always-loaded context or project docs, then adopt placement rules.
  Use when the user says audit CLAUDE/prune memory, 整理文档, or docs adopt.
argument-hint: "[context | docs audit | docs adopt]"
metadata:
  kind: meta
---

# context-audit

两个对象共用一套纪律：**假设显式化 → 表先行 → destructive 过用户**。

先按参数或请求选择模式：

- `context`：读 `references/context.md`，审每轮加载的 CLAUDE.md、imports、
  AGENTS.md 与 auto-memory。
- `docs audit|adopt`：读 `references/docs.md`；`audit` 完成体检后自动落
  placement 约定，单独 `adopt` 时只写约定、不做体检。
- 用户没点名且意图无法唯一判断时，只问一次模式。

只加载被选中的 reference，不把两套流程同时塞进上下文。任何删除、合并、移动或
重写，都必须先列已验证假设和 verdict 表，等用户确认后再执行。
