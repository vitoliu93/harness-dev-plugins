# Spec templates and context pack

Templates scale by tier to avoid bureaucratic padding.
The spec pack is the content of the vendor brief; transport formatting,
launch incantations, and vendor quirks belong to dispatch-vendors.

## S tier (default)

```yaml
goal:                 # one-sentence behavioral goal
files_owned:          # writes glob (used for pairwise concurrency intersect)
allowed_extra_writes: # whitelist beyond files_owned (used at post-hoc bounds check)
acceptance_cmds:      # schema below; files they touch are read-only for the worker
out_of_scope:         # explicit "do not touch" list
escalate_when:        # when to stop and report instead of improvising
```

## L tier (additions; mandatory for feature-type and contract/cross-repo tasks)

```yaml
interface_contract:   # verbatim signatures + error semantics, frozen by host first
invariants: []        # the targets of the host's contract spot-check
naive_failure_mode:   # host's own answer to "the laziest plausible implementation";
                      # doubles as the seed for adversarial review
context_pack_refs: [] # read-only project-layer assets
budget: {max_tokens: , max_retries: }
reads_contracts: []   # read-only contract dependencies
needs: []             # db / dev_server / object storage etc. (locked, parallelism=1)
```

## Acceptance command schema (each command)

```yaml
- id:
  cmd:                 # machine-checkable; exit code decides
  baseline_expect:     # FAIL | N/A (pure regression) — enforced by the pre-red gate
  anti_fake:           # independent execution proof (e.g. tsc --listFiles, pytest collected count)
  fixture_min:         # minimum fixture requirement
  provenance:          # spec | escaping:<issue_id> (protects commands from deletion)
```

## Repo hygiene floor (acceptance_cmds 最低配置)

For execution briefs, acceptance_cmds must include the target repo's full
self-check floor, run green by the worker before handoff — tests alone are
not the bar:

- **TS repos (opencut 类)**: unit tests on touched areas + `bunx biome check
  <touched paths>` (format included) + repo-level `tsc --noEmit`.
- **py repos**: pytest on touched areas + the repo's configured linter
  (e.g. `ruff check`) when one exists.

## Spec lint (zero-model, before queueing)

A vague-word hit marks an unresolved judgment point; the spec may not enter
the queue until each is resolved:
`reasonable | appropriate | when necessary | while you're at it |
consistent style | elegant | clean | as much as possible | at your discretion`.
The wordlist grows from ledger failure cases.

## Context pack (a manifest, not prose)

- **Three layers**: task = the spec (host-written delta) | project = house
  style, module topology, recon conclusions (read-only cached assets, reused
  across dispatches) | session = decisions already made for this requirement
  (append-only). Assembly is templated; the host writes only the task delta.
- File list = `{path, line_ranges, content_sha}`; recon assets carry
  `{generated_at_sha, covers_glob}`; if diff ∩ covers_glob is non-empty,
  mark [STALE] and force re-recon.
- Style constraints ship as positive/negative example pairs (real code plus
  "don't write it this way because X"), not abstract rules.
- Cross-repo implicit conventions (mirror semantics, "read this before
  touching X") are distilled into each repo's pack and attached with every
  spec.
- Hard budget ~12-15k tokens. Doesn't fit = task too big or judgment not
  converged; the router vetoes.

## Pre-dispatch probe (~2k tokens; moves context-failure detection earlier)

The worker answers exactly three questions: which files it would change,
which entry point it would start from, how it would run acceptance. Compare
against the host's writes set. Mismatch = add context and re-probe (≤2
times); still mismatched = re-route.

## Adversarial spec review (breaks spec-acceptance same-head correlation)

A cheap foreign-family model gets only the spec + acceptance commands, with
a fixed prompt: "You are a lazy coder. List 3 implementations that pass all
acceptance commands yet miss the intent, plus the acceptance command that
would catch each." The host takes one minute to adopt or reject each line.
Mandatory for high-stakes tasks; cost is tiny.
