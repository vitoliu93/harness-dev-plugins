# Model use guide — pick a capability, then the manifest slot

Concrete model names live in the per-machine vendor manifest
([vendor-manifest.schema.md](vendor-manifest.schema.md)); this guide is
capability-level and portable. Roles below are the manifest slot keys.
**Every chain floor is an Anthropic subagent** (Agent tool): no vendor process,
no foreign quota — dispatch there when carriers fail or the task needs
Anthropic models.

## `hard` — hard-tier closer

- SOTA-tier coding endurance; long unattended runs; precision review and
  adversarial verification.
- Weakness: UI/design taste vs the Claude family.
- **Route**: hardest agentic runs, long Q work, precision review /
  adversarial verification. Not look-and-feel judgment.

## `default_q` — volume workhorse

- Strong agentic loop, high output per token; good on IDE-session-shaped work.
- Weaknesses: novel-algorithm reasoning; occasional hallucinated API calls;
  high-recall/low-precision review style.
- **Route**: default Q dispatch — repo recon, bulk agentic coding, red-team
  sweeps. Pair findings with a stronger verifier (`hard` slot or headless
  fable advisory) before acting.

## `fast_light` — fast/light tier

- Cheaper per task than frontier peers; medium-length routine loops; vision
  when the cell supports it.
- Weak at one-shot architecture/design-opinion questions.
- **Route**: fast cheap edits, routine loops, light vision. Escalate
  architecture calls.

## `long_context` — 1M-ctx multimodal reader

- Long-context digestion, native vision, strong frontend work.
- Weaknesses: higher hallucination rate vs peers; over-proactive on ambiguous
  scope; security tasks need supervision; degrades if the harness truncates
  thinking.
- **Route**: long-context research/digestion, vision-grounded work, frontend
  generation, diversity-core review. Check factual claims; scarce quota —
  spend deliberately.

## `bulk` — bulk typist

- Cheap, well-specified mechanical codegen; migration/benchmark grinds.
- Weakness: weaker sustained tool-use vs frontier; text-only — vision degrades
  or needs the media-understanding fallback.
- **Route**: bulk code generation, test authoring, migration/benchmark grinds.
  Vision or high-trust tool use → other slots or media fallback.

## anthropic family — the floor

- Not vendor dispatch: Agent-tool subagent on this session's quota.
- **Route**: needs the loaded ecosystem (hooks/skills/session), Anthropic
  models specifically, or every carrier in the chain failed.

## Routing rules

1. Read the manifest; pick the capability the task needs, not a vendor.
2. Skip `unsupported` slots; `unknown` → probe (onboarding rung ②) before
   relying.
3. Diversity gate needs a foreign family — compare the slot's `family` against
   anthropic, not a brand.
4. `command -v` the cell CLI before launch; a cell whose binary is gone is
   skipped.
5. Quota: prefer the manifest `default_pool`; scarce pools → diversity-core or
   `long_context` only.
