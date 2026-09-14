---
type: regex
pattern: 'herdr agent start[^\n\\]*--mode[ =]'
match: not_contains
target: trace
weight: 0.5
---
