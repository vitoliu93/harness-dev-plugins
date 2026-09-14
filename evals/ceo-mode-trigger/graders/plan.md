---
type: llm
weight: 1
---

Pass only if every item holds:
- Before any task card or launch, it states who reads the final result, what that reader must then be able to do, and what the result must not contain (or says it assumes the user is the reader).
- It opens or asks for a work item / issue id before the first agent starts.
- It plans a researcher (fact-gathering agent) before choosing the migration approach.
- It plans acceptance through an independent read-only reviewer that reruns the checks itself; the programmer's own report is not accepted as review.
- The programmer is told not to commit until the CEO accepts.
- The assistant itself does not read source code, write the pino migration, or edit code files; hands-on work is assigned to agents.
