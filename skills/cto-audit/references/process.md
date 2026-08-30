# CTO audit — lenses, rules, phases

## Eight lenses

1. Why was this module split — is the reason still answerable?
2. Semantic duplication elsewhere?
3. Does the change bypass architecture constraints?
4. Which tests/docs should move — what stayed stale?
5. Temporary compat — is the original reason still valid?
6. Domain drift — boundaries still on business joints?
7. Concept consistency — one entity, one name?
8. Change amplification — modules touched per typical request?

## Power

- **CTO (this skill)**: architecture/domain/rules including rule-making
- **CEO (user)**: direction summary via `no-ai-slop`; veto via 规则变更公示
- **Line detail**: hand off to code-simplify / ponytail-review

## Rule lifecycle

1. **No rule without pain** — from observed friction only; note one-line source
2. **Rules die** — remove fossil rules when pain is gone
3. **Observe twice** — don't legislate imagined problems

## Weight

能力 > 性能 > 架构 > robustness ≫ 安全. Security only for major exposure in P0 one line.

## Activation

- Daily: constitution in hook/CI
- Signal: debrief suggests cto-audit
- Full audit: user only

## Phase 0 — scope

Parse `engineering|algorithm|delivery`. Scoped question narrows depth, not process.
Read all workspace `docs/audit/`; verify guards alive. recall/auto-memory for cross-check.

## Phase 1 — parallel evidence

Templates: [subagent-prompts.md](subagent-prompts.md). Issue cluster · Explore · git history · blind domain model (opus, docs only).

## Phase 1.5 — host reads

Walk one real request E2E; CI/tests; TODO/HACK archaeology; doc-code drift; concept alias grep.
Every strong claim needs host-run evidence.

## Phase 2 — synthesize

Triangulate issue ↔ code ↔ history. Domain diff: blind blueprint vs reality.

## Phase 2.5 — route findings

| route | when |
|---|---|
| harness patch | invariants machines can guard |
| code-simplify | line-level fix |
| CEO list | strategic tradeoff |

Mapping: naming table, constitution asserts, ADR, hooks, property tests. Retire fossil rules.

## Phase 3 — report

[report-template.md](report-template.md): one-line economics, 3–5 structural defects, 值得肯定, 规则变更公示, P0/P1/P2.

## Phase 4 — algorithm (optional)

Hunt "algorithm without offline eval loop". Anchor recommendations to measurable cost.

## Phase 5 — delivery (optional)

use-html visual · lark send · advanced-plan record-only

## Boundaries

No single-diff review, pentest, or business code edits except harness artifacts. Subagent claims need host verification.
