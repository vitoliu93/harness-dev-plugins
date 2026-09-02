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
- A programmer's `writes` never includes a production database or environment.
  Migrations are written to the repo only; the host runs them, test first.
  Write this exclusion into the card even when the task mentions no DDL.
- Write every downstream card (tester, operator, audit) while the first
  programmer is still running; do not wait for its result to start them.
- Tester receives the original requirement, the diff, and the runnable context
  it needs (repo path, how to run the tests). It does not receive the
  programmer's reasoning or report. Its `writes` may include a test directory
  when the run needs new tests, and never the code under test.
- Audit receives the original goal, the programmer output, the tester report,
  and the completion checks. Its `writes` is always `[]` for the audited
  repository; its report goes to a separately named path outside it.
- A card that writes to a shared live service (a CLI login, a database, an
  API) states the account it must run as, forbids switching it, and orders a
  `dry-run → small batch → audit → full run` gate. The small batch is a fixed
  gold set chosen to cover the edge cases (each named entity, none, silent or
  empty items, short items); the full run starts only after that set passes.
- A card whose job runs past ten minutes names a progress file and requires
  one line per batch (`N/M, elapsed, failures`) plus an idempotent
  failure list for resume. The host's sentinel watches that file; nobody
  reads terminal scrollback.
