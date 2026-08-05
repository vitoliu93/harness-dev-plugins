# Model roster, advisory, execution gate

## Model roster — dispatch a model, not a CLI

Pick model first; CLI is carrier. Chains floor on Anthropic subagent. Details: [models.md](models.md), carrier sheets.

| Model | Route for | Carrier chain |
|---|---|---|
| gpt-5.6-sol | hard tier, long unattended, precision review | cursor-agent → subagent |
| grok-4.5 | default Q workhorse | cursor-agent → grok CLI → subagent |
| composer-2.5 | fast/light, vision | cursor-agent → subagent |
| kimi-k3 | 1M ctx, vision, frontend | kimi-code → cursor-agent → subagent |
| deepseek-v4 | bulk codegen/tests | dscode → arkcode → subagent |
| anthropic family | needs this session's ecosystem | subagent (floor) |

Image tasks: vision model or media-understanding fallback ([vendor-onboarding.md](vendor-onboarding.md)).
Quota: cursor Ultra favors grok-4.5; gpt-5.6-sol for hard tier; kimi-k3 for diversity/1M/vision only.

## Advisory — 第二意见

Three moments: before substantive work; stuck (2+ dead hypotheses); before declaring done.

Gate: value is eyes you lack — fresh context, stronger reasoning, or foreign family.
Execution floor does not apply.

| Lack | Target |
|---|---|
| fresh context | subagent (reads brief paths) |
| stronger reasoning | `claude -p --model fable --effort high` |
| foreign family | vendor sheets (#3/#10) |

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
