---
type: regex
target:
  source: file
  path: q3.html
pattern: '<script[^>]+src=["'']?https?:|<link[^>]+href=["'']?https?:|@import\s+url\(["'']?https?:|fonts\.googleapis|cdn\.jsdelivr|unpkg\.com|cdnjs'
flags: i
match: not_contains
---
