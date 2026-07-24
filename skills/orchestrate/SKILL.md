---
name: orchestrate
description: >-
  Route and delegate coding work across vendors / subagents / host:
  eligibility, spec + acceptance authoring, parallel-worker gates, failure
  recovery. Trigger on 委派/delegate/派活 coding tasks, 编排/fan out parallel
  workers, "这个任务适合委派吗", a spec pack for a worker, or before you fan
  out coding work yourself. NOT single-task vendor CLI transport
  (dispatch-vendors owns that).
argument-hint: "[task or batch to delegate]"
---

# orchestrate

Delegation = write spec + acceptance instead of code; it pays only when
that is cheaper than doing it yourself. Quality = the acceptance-command
suite.

**Pipeline**: eligibility → route → spec pack → gates → transport
(dispatch-vendors / subagent) → acceptance + recovery → ledger.

## Eligibility (all AND)

- Hard gate: a machine-checkable acceptance command can be written; if not,
  host does it.
- Never forecast tokens; use observable signals: type default (config/ops
  stay inline); no-recon test (can name file+function = do it yourself);
  spec byproduct (spec writes the diff, or is slower than the change = take
  it back). Size and spec:diff lines are post-hoc ledger audits only.
- Exploratory work, tightly coupled repos: host. Cross-project long tasks:
  sweet spot, once contracts freeze. Break-even judged on the whole job so
  splitting smaller can't cheat.
- Cut by decision density (≤1 settled decision per unit) into
  acceptance-testable behaviors, never by layer.
- verification-weak (compile/type checks only) = "green but wrong" risk:
  upgrade tier or take back.
- spec lint: vague words = unresolved judgment; resolve before queueing.

## Routing

- **Vendor CLI** (dispatch-vendors): self-contained, quota-heavy tasks.
  Mid-tier generates; strong foreign family reviews (families must differ).
- **Subagent**: needs this session's context; recon/search. No model
  diversity by construction.
- **Host keeps**: requirement boundaries, spec, acceptance commands,
  contract spot-checks, arbitration, L3+ rescue. Judgment never delegates.

## Spec

S tier: goal, files_owned, allowed_extra_writes, acceptance_cmds,
out_of_scope, escalate_when. L tier adds contract, invariants,
naive_failure_mode, budget (mandatory for feature tasks, plus adversarial
spec review). Context pack: three-layer manifest, ~12-15k hard cap;
overflow = task too big. → `references/spec-pack.md`

## Gates (in order)

Pre-red (acceptance must fail on baseline) → probe (3 questions vs writes
set) → worker → run_receipt + zero-model validator → 3-layer review (host
contract spot-check | foreign adversarial | run acceptance) → serial merge
queue → close (all green, no rework). Writes globs intersect = serialize;
tests/fixtures edits need host review. → `references/gates.md`

## Recovery + ledger

L0 env retry → L1 self-fix → L2 other family → L3 upgrade / host takeover →
L4 human; only L3+ costs host tokens. Second failure: clean_reset, never
resume (overrides dispatch-vendors' two-resume default). Attribution 6-way,
default spec_gap. → `references/recovery-ledger.md`
