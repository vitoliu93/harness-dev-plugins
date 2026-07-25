# Quality gate details

Acceptance is executed, not re-read: a line-by-line diff review by the host
costs about as much as writing the code itself, which defeats delegation.
Design source: `docs/2026-07-23-coding-agent-orchestration-design.md` §4.5-4.6.
"High-stakes" below = tasks the host flags as red-line (security, money,
data loss); "clean pass" = both review layers and acceptance green with no
rework.

## 1. Pre-red gate (zero-model)

Run the acceptance suite on the baseline before dispatch. Commands with
`baseline_expect: FAIL` must go red (no red = no sensitivity, refuse to
dispatch); `N/A` regression commands must stay green. Run in an isolated
worktree at a pinned tree hash (a stash-based check misses untracked files
and can swallow the stash if it fails midway). anti_fake signals confirm
execution independently (tsc with --listFiles, pytest collected count), and
the probe path must not share a hijackable layer with the command under
test (a hook can fake-green tsc or vitest).

## 2. Reward-hacking defenses

- Mechanically split the diff three ways: implementation / tests_fixtures /
  config. Any tests_fixtures change requires host review and is rejectable.
- `touched_acceptance_files=true` in the receipt: auto-reject and record an
  integrity_violation (three of them = routing blacklist).
- Acceptance commands are visible to the worker (useful for self-checking)
  but never writable.
- Retry loops teach the worker what acceptance looks like; overfitting
  worsens with each retry.

## 3. Machine receipts (run_receipt + validator)

Delivery must include a machine-generated (not self-reported) receipt:
`{exit_code, acceptance_runs:[{cmd, stdout_sha256, exit_code}], diff_stat,
files_touched, env_digest}`.
Reports pass a zero-model validator first: evidence_ref must resolve,
hedge-word scan (should / looks like / probably / untested but) bounces the
report, the unverified section is mandatory, env fingerprint must match.
The host spends tokens only after all green, and audits artifact
completeness, never narrative. Residual risk: the validator catches
omissions, not forgery; true-source spot checks are reserved for
high-stakes tasks.

## 4. Three review layers (three checks, three owners; coder self-review excluded)

| Check | Owner | Form |
|---|---|---|
| Contract conformance | host | Targeted invariant spot-check against the spec the host wrote (high-stakes: always 100%; steady state slides: 8 consecutive clean passes with zero escapes → cut to 1/3; one escape → back to 100%) |
| Quality / conventions / over-engineering | foreign strong model | Three-part prompt: full spec + diff + attack instruction "assume the author cut corners to pass acceptance"; findings must carry a counterexample_input or are rejected; style notes ≤3, listed separately. Sampled by risk tier, never exhaustive (exhaustive review eats the savings) |
| Behavioral correctness | execute acceptance | Run the commands; don't read the code |

## 5. Integration acceptance (merge queue; the one mandatory serial point)

Per-worker green does not imply merged green. Merge candidate branches into
a preview branch in descending diff_size and run the full suite. Green:
merge the preview branch into main as a whole (do not fast-forward
candidates one by one; after the first lands, the rest are no longer
ancestors of main). Red: bisect the candidate set, kick out the offender,
rebuild the preview. Acceptance reports carry tree_hash; the host verifies
acceptance ran on the exact tree being merged.

## 6. Concurrency control

- Specs must fill files_owned + allowed_extra_writes. Pairwise-intersect
  before dispatch; non-empty = serialize or re-split. After completion,
  re-check with `git diff --name-only`; out-of-bounds = reject.
- Contract files in the intersection = the task split failed; the host
  lands the contract first, then parallelizes on the frozen contract.
- Lockfile iron rule: dependency changes always go first, serially;
  parallel tasks may not install new packages.
- Shared state (DB, ports, object storage) is a first-class locked
  resource; parallelism = 1.
- Worktree break-even: task duration < 2x environment setup time = don't
  open one。

## 7. Mutation spot-checks (sampling acceptance sensitivity)

Every ~20 dispatches, mechanically inject one known break into one of them
(drop a validation, off-by-one a boundary, swap arguments, swallow an
exception) and re-run acceptance; it must catch the break, otherwise freeze
that task_type until the suite is hardened. Escaped defects get three-way
attribution: missing acceptance command (add one) / spec gap (fix the
template) / reviewer blind spot (fix the attack prompt); if one layer
accounts for >50%, fix that layer's template. New acceptance commands carry
provenance so they can't be quietly deleted.
