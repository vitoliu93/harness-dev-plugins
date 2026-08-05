# Failure recovery, circuit breakers, ledger

## Recovery levels (only L3+ costs host tokens)

| Level | Trigger | Action |
|---|---|---|
| L0 | environment (network / quota blip) | zero-model retry, not counted as failure |
| L1 | compile / lint red | vendor self-fix (one resume) |
| L2 | still red after L1 | same tier, different model family |
| L3 | two failures / integrity violation / failure modes that don't repeat (= the spec has a hole) | tier upgrade or host takeover |
| L4 | L3 doesn't converge | escalate to a human |

- **Anti-drift**: from the second failure, force clean_reset: fresh worktree
  + spec only + a ≤500-token failure summary. Never resume onto a drifted
  foundation. When dispatching through this skill, write `max_resume=1` and
  the clean_reset condition into the transport brief (this overrides
  dispatch-vendors' own two-resume default).
- **Mid-run quota limits**: follow dispatch-vendors "Vendor limited mid-run"
  (diagnose before acting, harvest partials, hand over to a different
  family, ledger as fail(quota-limited)).
- **6-way attribution**: `spec_gap / context_gap / capability / quirk /
  flake / quota`. Unsure = spec_gap (bias with the evidence: fix templates
  rather than falsely blacklist a cheap worker). capability is the only
  value that triggers tier-down or blacklist.

## Vendor fleet: profiling and admission

- Adapter thin interface, one file per vendor: `spawn(spec_pack) →
  session_id / resume(session_id, feedback) / collect → {diff, report,
  cost_units, quota_state} / clean_reset`. Quirks stay inside the adapter
  (vendor sheets live in dispatch-vendors' references); the router sees
  only the interface.
- Profile per (vendor, task_type) bin: Beta posterior with Wilson lower
  bound. n≥6 and bound ≥0.6 to accept that class of work; under 6 runs =
  probation (≤20% share + forced double review); 3 consecutive capability
  failures = 30-day blacklist for the pair; version drift resets the prior
  to 0.5. Routing score = Wilson bound × remaining-quota coefficient
  (quota_state comes from run receipts and the ledger; console-side window
  sizes are not observable, per dispatch-vendors).
- New vendor admission: shadow-replay a golden task set, then a 5-run
  canary (hard budget cap + double review), and enter the routing table
  only by beating the incumbent on some task type. Keep the fleet small.
  Full ladder: design doc §4.4 and dispatch-vendors' vendor-onboarding
  reference.

## Hard circuit breakers

- (task_type, vendor) rolling-20 failure rate >40%: degrade to host_direct.
- Session-level: tokens burned on failed delegation exceed 30% of tokens
  saved by successful ones: freeze all delegation and alert.
- task_type net_savings negative over a rolling 10 dispatches: remove from
  the delegable list.
- Leading indicator of decay: weekly slope of host re-read depth, report
  bounce rate, and escalation rate (fires 1-2 weeks before rework rate);
  positive for 2 consecutive weeks = auto-degrade that task_type.
- Vendor outages correlate (quotas run out together at month-end). Price
  the degradation path in advance: which task_types queue frozen, which
  the host does itself; chaos-drill it quarterly, cost counted into ROI.

## Ledger (extends ccobs obs.db; writes are zero-model)

`job_ledger{task_id, issue_id, task_type, route, plan_slug,
spec_host_tokens, host_tokens_total, host_rescue_tokens, vendor,
vendor_version, spec_pack_hash, attempts, escalated, rework_rounds,
outcome, failure_mode, mutation_check, quota_state, merged_at}`
plus a vendor_runs detail table. The host fills exactly one field
(failure_mode) and only on failure. verification-strong and -weak queues
record success rates separately; the weak queue ("green but wrong" risk)
needs >80%.

- **Two-currency governor**: host 5h-window tokens + vendor quota share.
  Host window >80% spent: only judgment work passes. Per-session hard caps:
  concurrent workers ≤3, dispatches ≤8.
- Savings metric: `host_tokens_per_merged_task` (failures, rework, cleanup
  all amortized in). Always report the within-quality-bar savings rate
  (clean-pass dispatches only) to resist Goodharting.

## Cost anchors (post-hoc audit only)

Use median self-do token anchors and first-pass rates from ledger history — not as dispatch gates.
Delegable pool ≈40–50% of coding sessions; sub-10k dispatches signal loose eligibility.
