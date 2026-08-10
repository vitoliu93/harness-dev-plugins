# Capability roster, advisory, execution gate

## Fleet — read the manifest first

Concrete carriers and models are per-machine: read `$VENDOR_MANIFEST`
(`${CCOBS_DIR:-$HOME/.claude/observability}/vendor-manifest.json`) before
routing. Schema, bootstrap and example:
[vendor-manifest.schema.md](vendor-manifest.schema.md). Missing → bootstrap
from [vendor-onboarding.md](vendor-onboarding.md).

## Capability roster — dispatch a capability, not a model

Pick capability first; the manifest slot names the model; the carrier sheet
names the CLI. Slot roles `hard` · `default_q` · `fast_light` ·
`long_context` · `bulk` — what each routes for:
[model-use-guide.md](model-use-guide.md). Chains floor on Anthropic subagent
(needs this session's ecosystem — not a manifest slot).

Image tasks: `vision`-capable slot or media-understanding fallback
([vendor-onboarding.md](vendor-onboarding.md)).
Quota: prefer the manifest `default_pool`; scarce pools for diversity-core /
`long_context` only.

## Advisory — 第二意见

Three moments: before substantive work; stuck (2+ dead hypotheses); before declaring done.

Gate: value is eyes you lack — fresh context, stronger reasoning, or foreign family.
Execution floor does not apply.

| Lack | Target |
|---|---|
| fresh context | subagent (reads brief paths) |
| stronger reasoning | `claude -p --model fable --effort high` |
| foreign family | a manifest cell outside the anthropic family (carrier sheets) |

Brief + output: [advisory.md](advisory.md). Ledger as `why:advice`. Verdict is hypothesis until you Read cited paths.

## Execution gate — dispatch if ≥1 pays

- **D** Diversity: non-Anthropic eyes (review, red-team, second implementation)
- **Q** Quota: ≥20 min or ≥300 lines unattended work
- **I** Index: cursor workspace index beats cold grep

**Q floor**: below 20 min / 300 lines → inline or subagent, unless user standing `why:obs` directive.
**A veto**: success must be machine-checkable; visual feel stays inline or spec-extraction first.

Also: one-prompt brief · zero mid-task interaction · verify cheaper than re-derive · brief shorter than doing it yourself.

## Don't dispatch

- Blocks your next step → inline
- Needs >~200 lines session context → subagent
- Diff review → code-review; web fan-out → research; orchestration → Workflow
- User wants to watch → inline
