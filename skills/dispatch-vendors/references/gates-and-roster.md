# Capability roster, advisory, execution gate

## Fleet — read the manifest first

Concrete carriers and models are per-machine: read `$VENDOR_MANIFEST`
(`${CCOBS_DIR:-$HOME/.claude/observability}/vendor-manifest.json`) before
routing. Schema, bootstrap and example:
[vendor-manifest.schema.md](vendor-manifest.schema.md). Missing → bootstrap
from [vendor-onboarding.md](vendor-onboarding.md).

## Roster — dispatch a role, not a model

Pick the role first; the manifest names the models under it; the carrier sheet
names the CLI. Two roles only — `advisor` (verdicts) and `executor` (artifacts)
— what each routes for: [model-use-guide.md](model-use-guide.md). Chains floor
on a host subagent (needs this session's ecosystem — not a manifest cell).

`host_family` means the current main-session model family, resolved at runtime
and never hardcoded in the skill or manifest. A different-family route requires
`slot.family != host_family`; if the host family is unknown, do not claim the D
gate—route only on Q or I.

Effort is per task, never below the manifest `effort_policy.floor`; each cell's
`effort_syntax` says how to pass it.

Image tasks: `vision`-capable cell or media-understanding fallback
([vendor-onboarding.md](vendor-onboarding.md)).
Quota: prefer the manifest `default_pool`; scarce pools for diversity-core and
long-context reads only. Pool exhausted → `fallback_route` or another cell
holding the same role.

## Advisory — 第二意见

Three moments: before substantive work; stuck (2+ dead hypotheses); before declaring done.

Gate: value is eyes you lack — fresh context, stronger reasoning, or a different model family.
Execution floor does not apply.

| Lack | Target |
|---|---|
| fresh context | host subagent (reads brief paths) |
| stronger reasoning | host's stronger-reasoning configuration or a manifest `advisor` slot |
| different family | a manifest slot whose `family` differs from `host_family` |

Brief + output: [advisory.md](advisory.md). Ledger as `why:advice`. Verdict is hypothesis until you Read cited paths.

## Execution gate — dispatch if ≥1 pays

- **D** Diversity: different-family eyes (review, red-team, second implementation)
- **Q** Quota: estimated ≥20 min of unattended work, or ≥300 lines of output
- **I** Index: cursor workspace index beats cold grep

**Q floor**: below both thresholds → inline or subagent, unless user standing `why:obs` directive.
**A veto**: success must be machine-checkable; visual feel stays inline or spec-extraction first.

Also: one-prompt brief · zero mid-task interaction · verify cheaper than re-derive · brief shorter than doing it yourself.

## Don't dispatch

- Blocks your next step → inline
- Needs >~200 lines session context → subagent
- Diff review → code-review; web fan-out → research; orchestration → Workflow
- User wants to watch → inline
