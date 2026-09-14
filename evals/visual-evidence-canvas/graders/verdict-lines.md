---
type: llm
focus: last_message
weight: 1
---

检查最终回复的证据包格式。以下全部满足才算通过：
- logo 选中框判 PASS，并带上具体数值证据（2px 或 148.5 之类）。
- watermark 锁形角标判 FAIL，证据是 `.lock-badge` 数量 0，并说明查过渲染代码、没有抑制条件（例如 LayerRow.ts 根本没渲染角标）。
- 每个验收项都有一个明确的 PASS / FAIL / BLOCKED 结论，不是"基本正常""建议再看看"这种含糊说法。
