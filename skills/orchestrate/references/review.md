# Review rules

- The checking role builds its own fixture: a maker's rig can disable the very
  thing it claims to prove — an env override that also starves a dependency, a
  probe that samples only the hit.
- The reviewer covers correctness, project fit and simplification, and
  algorithm and performance. Blocking findings cite exact code and evidence.
- Review once per repository on the integrated diff, not once per work package:
  makers commit to their own branches and keep going. Reverse injection per item
  is for fixes to data loss, concurrency, and permission; the rest gets a diff read.
- Review roles run at effort medium or higher on any agent; pass the level
  for the run when the alias default is lower or empty.
- Freeze reviewed targets during review: the reviewed directory accepts no
  changes once review starts; to change it, stop review or await its report,
  record the new commit or diff summary, and re-review. Review cards state the
  baseline (commit, or use-agents `scripts/fingerprint.sh` for uncommitted work).
- Re-review cap: run at most 2 independent review rounds per integrated diff.
  If round 2 still FAILs, stop the automatic fix-and-re-review loop and
  escalate to the user with residual risks and options.
- Round-2 scope lock: a re-review checks only (1) whether round-1 blockers are
  fixed and (2) whether the fix diff introduced regressions. Do not expand
  fuzz or property generators to mine pre-existing edge cases; log newly
  noticed pre-existing issues as follow-ups unless they violate data-loss,
  protection-column, or security invariants.
- Tiered PASS invalidation (host edits included): edits to core runtime logic
  (writers, permissions, guards, concurrency, rollback, state transitions) void
  PASS and require re-review. Edits that touch only tests, docs, copy, config,
  lockfiles, or ≤15-line localized fixes / rebase conflict resolutions do not
  void PASS: the host reads the diff, reruns the full suite, and names the
  unreviewed delta in the report.
- Non-blocking findings go to the next phase's card by default instead of a
  fix-and-re-review loop, and never void a PASS.
