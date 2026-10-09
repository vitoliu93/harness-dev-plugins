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
- Freeze shared contracts before parallel programmers start. Then turn every
  `must` / `must not` line of the contract into a runnable check (one shell line
  is enough) before the first line of implementation; both the maker and the
  reviewer copy their checks from that list, not from intuition.
- When the reviewer's acceptance card may raise open rulings, ask for the
  rulings first as a separate 5-minute deliverable; the host rules, then the
  maker starts.
- A fix card that touches auth, ownership, billing, or untrusted input states
  its invariants before the maker starts, not after the reviewer finds each
  bypass: what decides permission comes only from rows the caller cannot write
  (never a client-sent type, owner, or key row); errors and empty catalogs
  deny; every input has a length and count cap; charges happen after all
  checks. Before fixing the scope, `rg` every sibling entry point (the twin
  route, the other client that reads the same table) and sample real
  production values (non-ASCII keys, other buckets). Every ruling the host
  gives the reviewer goes to the maker in the same message.
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
  Every card the host watches, read-only auditors included, ends its result
  file with a done marker, and the host waits with use-agents
  `scripts/wait-result.sh`, never a hand-written loop on `agent_status`: a
  finished Claude agent reports `done`, not `idle`, so a loop that waits for
  `idle` can sit half an hour after the file is written.
  When a card's completion is watched with a sentinel, the done marker must
  occupy the result file's last non-empty line alone (ignoring leading or trailing
  whitespace and CRLF).
- A card that writes to a shared live service (a CLI login, a database, an
  API) states the account it must run as, forbids switching it, and orders a
  `dry-run → small batch → review → full run` gate. The small batch is a fixed
  gold set chosen to cover the edge cases (each named entity, none, silent or
  empty items, short items); the full run starts only after that set passes.
- A card whose job runs past ten minutes names a progress file and requires
  one line per batch (`N/M, elapsed, ETA, failures`) plus an idempotent
  failure list for resume. The host's sentinel watches that file; nobody
  reads terminal scrollback.
- A card that builds or reshapes a table, dataset, or any row-per-thing
  deliverable states the row meaning in one sentence ("one row = one
  reference image, with its one video") and the host confirms that sentence
  with the user before the first agent starts. "Like the last deliverable"
  constrains quality, not shape. A deletion against a live service with more
  than one table names the table; the host does not pick the scope itself.
