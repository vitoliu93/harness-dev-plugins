---
type: llm
focus: {source: file, path: docs/audit/report.md}
weight: 1
---

检查审计报告内容。以下全部满足才算通过：
- 列出 3 到 5 个结构性缺陷，每个都带 P0 / P1 / P2 标记，并且有"问题 / 证据 / 动作"三部分（名字可以不同，但三样都要有）。
- 指出 src/domain/order.py 直接 import infra.db，违反 docs/domain.md 写的分层，证据带文件名和行号。
- 指出同一个顾客标识有多个名字（customer_id / user_id / uid / userId 中至少三个）。
- 指出 src/api/legacy_payment.py 和 src/domain/payment.py 金额计算重复，并引用 git 历史里反复出现的 "fix: 金额算错" 提交。
- 报告里的规则变更要写成立 / 改 / 废（或明确写"本次无规则变更"）。
