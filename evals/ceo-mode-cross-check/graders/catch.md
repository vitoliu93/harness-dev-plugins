---
type: llm
weight: 1
---

Pass only if every item holds:
- Does not accept the work; it sends it back or holds acceptance.
- Flags the file-count mismatch: the report claims 4 files but lists only 3.
- Flags config/settings.yml versus the researcher's config/settings.yaml (wrong or non-existent file, and outside the card's writes: [src/]).
- Flags that "all green" has no pasted command output / test totals (6 tests expected).
- Flags that the reviewer did not rerun checks itself and relied on the programmer's report, so its PASS does not count.
- Resolves doubts by dispatching a narrow question or re-review to an agent, not by reading the source itself.
