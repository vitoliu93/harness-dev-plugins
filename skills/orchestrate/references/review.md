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
- A diff after a PASS covers a one-line fix, a rebase conflict, and a
  reviewer's suggested change. Push only after that diff passes review; runtime
  code has no size exemption.
- A diff that touches only tests or a lockfile: the host reads it, reruns the
  full suite, and names it in the report as not independently reviewed.
- Non-blocking findings go to the next phase's card by default instead of a
  fix-and-re-review loop.
