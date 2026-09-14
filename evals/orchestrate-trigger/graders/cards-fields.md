---
type: llm
focus: {source: file, path: cards.md}
weight: 1
arm: with-only
---

You are shown cards.md, which holds the role cards. Pass only if every item holds:
- There is one card per role instance, covering researcher, programmer, and reviewer.
- Every card has goal, inputs, writes, output, completion_checks, and depends_on.
- depends_on puts researcher before programmer, and the reviewer's final verdict after the programmer. A reviewer step that writes acceptance checks before the programmer starts is allowed.
- The researcher card writes nothing inside the repository. The reviewer card never writes the files it reviews; it may write only its own acceptance list, the tests it declares before the change, and a report outside the repository.
- The reviewer card takes the diff as input and does not accept the programmer's own report as evidence.
- The programmer card excludes production databases and environments.
