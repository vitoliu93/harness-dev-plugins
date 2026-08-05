---
name: orchestrate
description: >-
  Route coding work across host, subagent, and vendor with spec plus acceptance gates.
  Use when 委派/编排/fan out、并行开发别让 worker 撞车, or deciding vendor vs subagent.
argument-hint: "[task or batch to delegate]"
metadata:
  kind: sop
---

# orchestrate

Delegation pays when spec + acceptance is cheaper than coding yourself.

**Pipeline**: eligibility → route → spec pack → gates → transport → acceptance → ledger.

## Eligibility (all AND)

- Machine-checkable acceptance exists; else host keeps it
- Route by observable signals, not token forecasts
- Cut by decision density into acceptance-testable units
- verification-weak queues need stronger review or take-back

## Routing

- **Vendor** (dispatch-vendors): self-contained, quota-heavy
- **Subagent**: needs session context
- **Host**: boundaries, spec, acceptance, arbitration, L3+ rescue

Details: [spec-pack.md](references/spec-pack.md) · [gates.md](references/gates.md) · [recovery-ledger.md](references/recovery-ledger.md)

## Recovery

L0 env → L1 self-fix → L2 other family → L3 upgrade/host → L4 human.
Second failure: clean_reset, not resume. **6-way attribution** default `spec_gap`.
