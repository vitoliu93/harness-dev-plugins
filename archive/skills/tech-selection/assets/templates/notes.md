# Research Notes: <subject>

> The live source of truth + hypothesis tree. Update `Current State` constantly; append dated findings; never rewrite history — mark superseded.

## Current State  ← the resume cursor
- **Move**: frame | gather | hypothesize | de-risk | decide | self-critique
- **Owner**: <session-id>   **Lease**: <YYYY-MM-DDThh:mmZ> (multi-agent only)
- **Branch**: <git branch>
- **Biggest open uncertainty**: <the assumption that, if false, breaks the approach>
- **Last done**: <last concrete action, or "nothing yet">
- **Next**: <the very next action>

## Hypothesis tree
> Each branch: claim · confidence (low/med/high) · evidence for/against · status (open | confirmed | killed).

- **H1** — <approach / claim>
  - confidence: <low|med|high>  status: <open>
  - for: <evidence + source>
  - against: <evidence + source>
- **H2** — <competing approach>
  - confidence: …  status: …
  - …

## Findings (append-only, dated)
> M0 = first experiment run (the branch result). M1/M2 = practical corrections found during or after a pass — usually NOT failures, but implementation surprises ("works in principle, but needs X"). State the assumption that was partly wrong + the adjusted config.
- **<YYYY-MM-DD> M0** — <what was learned; which hypothesis it moved; confidence shift; branch taken>
- **<YYYY-MM-DD> M1 修正** — <post-pass correction: what assumption was partly wrong → adjusted config; what earlier finding it supersedes>

## Self-critique
- <Re-read against success criteria: is a hypothesis now disproven? Is confidence calibrated? What am I avoiding testing?>
