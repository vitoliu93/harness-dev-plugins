---
type: regex
pattern: "Status\\*{0,2}:\\s*\\*{0,2}closed"
flags: i
match: contains
target: {source: file, path: docs/advanced-plans/_archive/2026-09-10-json-flag/todo.md}
---
