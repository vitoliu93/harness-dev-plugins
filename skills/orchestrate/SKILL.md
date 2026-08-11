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

## Verification lanes

Machine acceptance proves a change was built right; it cannot prove it
*presents* right. Route by where the change's truth is observable, not by which
layer of the stack it edits: a diff whose outcome is fully machine-assertable
(a contract, a row, a pipeline state) needs no eyes — even in a frontend repo.
When the truth only exists in a rendered page, mount the **visual role** on top
of machine acceptance.

The visual role is an abstract slot: "an agent with eyes on a browser". This
layer knows only that the slot exists; which agent fills it, what it certifies,
and how it drives the browser belong to the SOP layer (`visual-evidence`,
`opencli-browser`) and the project's own binding. Presentation verification is
token-expensive while a human look is fast — the visual agent runs full
acceptance by default; the human is the cheap recheck and fallback channel.

Details: [spec-pack.md](references/spec-pack.md) · [gates.md](references/gates.md) · [recovery-ledger.md](references/recovery-ledger.md)

## Recovery

L0 env → L1 self-fix → L2 other family → L3 upgrade/host → L4 human.
Second failure: clean_reset, not resume. **6-way attribution** default `spec_gap`.
