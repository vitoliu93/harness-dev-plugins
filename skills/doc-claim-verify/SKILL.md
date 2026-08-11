---
name: doc-claim-verify
description: >-
  Verify every claim in a document against code, commands, and git ground truth, then emit a JSON verdict report.
  Use when the user asks 核验/实证 a document's claims, or asks whether a doc still matches the codebase.
argument-hint: "[文档路径] [代码库根目录...]"
metadata:
  kind: sop
---

# doc-claim-verify

一份文档 → 逐条声明 → 到真源取证 → 结构化判定。适用于文档与代码是否仍然一致；
不适用于评价文档该不该删、该怎么改，也不适用于代码质量审查。

流程细节：[procedure.md](references/procedure.md)。输出契约：[report-schema.md](references/report-schema.md)。

## Hard gates

- 只读取证：不对被核验的文档与代码库执行 Write / Edit / git 写操作。唯一允许的写是报告文件。
- 取证前先 `git fetch`，基线取 origin 上的集成分支，不用本地工作区。
- 按符号与内容定位，不信文档里的行号；行号只作为提示。
- 每条声明必须落一个 verdict：`true` / `false` / `undecidable`，且带 evidence。
- 完整 JSON 写文件，对话内只回报告路径 + 计数摘要；禁止把全量 JSON 打进回复。
- 不输出删改建议；用户另行索取时才给。

## 执行骨架

1. 读文档，拆成原子声明，编号 `C1..Cn`，each 带原文引用。
2. `git -C <repo> fetch --quiet`，确定基线 ref，记进报告头。
3. 逐条取证：符号搜索 / 路径存在性 / `git show <ref>:<path>` / 只读命令，记下命令与命中片段。
4. 判定：证据支持 → `true`；证据反证 → `false`；真源不可达或声明不可证伪 → `undecidable` + `reason`。
5. 写报告文件，回一行摘要：`路径 · n 条 · true/false/undecidable · 命中率`。

## 验收口径

- 声明数 = 报告条目数，无遗漏、无合并。
- 每条有 verdict 与 evidence；`false` 有反证，`undecidable` 有 reason。
- 报告文件存在且能被 JSON 解析。
- 声明超过 30 条：分批取证、增量追加写文件，不靠单次长输出。
