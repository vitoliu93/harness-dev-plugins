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

Reviewer and acceptance cards add five required fields. A card with any of
them empty does not launch.

```yaml
role: reviewer-api
baseline: commit sha, or use-agents `scripts/fingerprint.sh` output
reverse_injection:          # one per completion check; each must turn its test red
  - check: refresh token expired returns 401
    inject: remove the expiry branch in auth.ts
result_file: /tmp/<slug>/review.md   # the file the sentinel watches
done_marker: DONE-REVIEW              # last non-empty line of result_file, alone
evidence_rules:
  - no placeholder (TODO, TESTLINE, <…>) left in the report
  - every screenshot listed with its sha256; a repeated sha is not evidence
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
- At least one test in a fix crosses the real adapter: the IPC wrapper, the
  RPC error mapping, the CAS or lock. A fixture that throws the bare error or
  skips the lock proves nothing about the real path (an Electron invoke error
  carries a prefix; PostgREST maps a missing function to 503 before the app
  sees it).
- A maker hands in a guard only after deleting it once and seeing its test go
  red, then restoring it. A fixture whose data cannot reach the guarded branch
  stays green and costs a review round.
- A UI card with a design reference lists one completion check before user
  testing: read the running UI and compare it to the reference item by item
  (sizes, hover, keyboard focus, menu contents, data that arrives late). The
  user's acceptance is the last step, not where differences are first found.
- A fix that cleans up, deletes, or migrates stored data lists before the maker
  starts: every other writer and version of that data, data written before the
  fix, and a failed step retried. Its test runs two processes and goes red first.
- A flakiness or rate claim states the runs per arm and the comparison arm.
  Under ten runs per arm is an observation, not a rate; a difference with no
  shown cause is reported as unexplained, not as "intermittent" or "unrelated".
- A card that may write test data lists the allowed objects, the most POSTs or
  paid runs, and the allowed entry points. A wait starts from the new request
  or id, and stops when none appears in a few minutes. An agent that finds the
  listed entry blocked comes back for a ruling; it does not swap in another.
- The done marker is written last, after every check exits and no placeholder
  is left. A verdict changed after DONE is a new versioned report; later cards
  cite the report hash and verdict, never "last round PASS".
- A reviewer makes no git write in any checkout, `fetch` included, and runs
  probes with their own userData and HOME. A frozen worktree gets no new fix
  card until its review reports.
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
