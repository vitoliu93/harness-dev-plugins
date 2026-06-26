# Glossary & Data Flow: <subject>

> Optional — for jargon-dense domains. Gives everyone one shared 口径 (vocabulary) so notes/decision read unambiguously.

## Terms
| Term | Plain meaning | Where it sits in the pipeline |
|------|---------------|-------------------------------|
| <term> | <one-line, jargon-free> | <which stage / module> |
| <term> | <…> | <…> |

## Data flow
```
<input>
  │ <tool / stage>
  ▼
<intermediate> ──┬── <branch A: tool> → <output fields>
                 └── <branch B: tool> → <output fields>
                        │
                        ▼
                   <final structured output>
```

## Contract notes
- <key invariant — e.g. "stage B and C both consume only the separated stem, never the raw mix">
