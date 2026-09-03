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
- Write every downstream card (reviewer, assistant) while the first
  programmer is still running; do not wait for its result to start them.
- The reviewer receives the original requirement, the diff, and the completion
  checks; it never takes the maker's report as evidence. Its `writes` cover
  only the tests or acceptance list it wrote before the change started, never
  the files it reviews; its report goes to a path outside that repository.
- A card that writes to a shared live service (a CLI login, a database, an
  API) states the account it must run as, forbids switching it, and orders a
  `dry-run → small batch → review → full run` gate. The small batch is a fixed
  gold set chosen to cover the edge cases (each named entity, none, silent or
  empty items, short items); the full run starts only after that set passes.
- A card whose job runs past ten minutes names a progress file and requires
  one line per batch (`N/M, elapsed, failures`) plus an idempotent
  failure list for resume. The host's sentinel watches that file; nobody
  reads terminal scrollback.
