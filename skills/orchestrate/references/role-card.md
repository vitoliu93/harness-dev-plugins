# Role card

Write one card before starting each role.

```yaml
role: programmer-api
goal: one observable result
inputs:
  - exact file, link, or prior-role output
writes:
  - allowed paths, or [] for read-only
output: exact artifact or answer shape
completion_checks:
  - command or observable check
depends_on: []
stop_when:
  - missing input
  - requested work crosses the write boundary
```

Rules:

- Use paths and source material, not a retelling when the source exists.
- One card covers one role instance.
- Freeze shared contracts before parallel programmers start.
- Intersect write lists before launch. Any overlap must be serialized or split.
- Tester receives the original requirement, the diff, and the runnable context
  it needs (repo path, how to run the tests). It does not receive the
  programmer's reasoning or report. Its `writes` may include a test directory
  when the run needs new tests, and never the code under test.
- Audit receives the original goal, the programmer output, the tester report,
  and the completion checks. Its `writes` is always `[]`.
