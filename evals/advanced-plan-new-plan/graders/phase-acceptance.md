---
type: llm
focus: trace
---

Pass only if all of these hold:
- A todo file was written that has a "Current State" section naming the current phase, its status, and the next action.
- The todo file splits the work into phases, and every phase has its own acceptance criterion and a concrete verification method (a named command or test such as `bun test`).
- No source file under src/ was edited.
