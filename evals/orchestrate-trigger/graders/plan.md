---
type: llm
weight: 1
arm: with-only
---

Judge the final reply. Pass only if every item holds:
- The researcher runs before the programmer, and the reviewer gives its verdict after the programmer's change. A reviewer step that writes acceptance checks before the programmer starts is allowed and does not break this order.
- The host moves outputs from one role to the next (for example, the host hands the diff to the reviewer); roles do not message each other.
- The reviewer reruns the checks itself instead of trusting the programmer's report.
