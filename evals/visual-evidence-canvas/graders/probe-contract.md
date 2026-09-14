---
type: regex
target: {source: file, path: probes/canvas-probes.ts}
pattern: '^(?=[\s\S]*exit)(?=[\s\S]*(BLOCKED[^\n]{0,60}\b2\b|\b2\b[^\n]{0,60}BLOCKED))'
match: contains
weight: 1
---
