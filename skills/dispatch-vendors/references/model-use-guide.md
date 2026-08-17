# Model use guide — pick a role, then a model from the manifest

Concrete model names live in the per-machine vendor manifest
([vendor-manifest.schema.md](vendor-manifest.schema.md)); this guide is
role-level and portable. There are two roles.
**Every chain floor is an Anthropic subagent** (Agent tool): no vendor process,
no foreign quota — dispatch there when carriers fail or the task needs this
session's loaded ecosystem.

## `advisor` — judgment

- Review, adjudication, second opinion, adversarial verification, spec
  interpretation. Produces a verdict, not a diff.
- Deliberately narrow: only top-tier models belong in this role. Quota saved on
  a verdict is not a saving — the verdict decides what gets built.
- **Route**: 第二意见 · diff/branch review · red-team verification · "is this
  approach right before I build it".
- Not for: bulk work of any kind. An advisor that starts editing is mis-cast.

## `executor` — work

- Produces artifacts: diffs, test suites, migrations, digests, benchmark runs.
- Models differ by pool, family, context window and modality, not by tier —
  read the slot `note` before picking. Text-only models need the
  media-understanding script for images; 1M-ctx models take the long reads.
- **Route**: everything that ends in a file, a diff or a report.
- Pair a `default`-shaped executor sweep with an `advisor` pass before acting on
  its findings — high recall, unverified precision.

## Picking within a role

1. **Pool first.** Prefer `default_pool`; scarce pools go to diversity work and
   long-context reads. Exhaustion can be per-slot inside a live cell — a
   carrier may bill some models to the subscription and others to a capped
   allowance — so read `status` per slot, not per cell.
2. **Family for diversity.** The diversity gate needs `family != anthropic`,
   compared on the slot's `family` field, not on brand names.
3. **Modality and context** from the slot note — vision, text-only, 1M ctx.
4. **Status.** Skip `unsupported` and `quota-exhausted`; `unknown` → probe
   (onboarding rung ②) before relying.
5. `command -v` the cell CLI; a cell whose binary is gone is skipped.

## Effort

The manifest stores no default level. Choose per task from its difficulty, never
below `effort_policy.floor`. Cheap mechanical edit → floor. Novel algorithm,
subtle concurrency, security reasoning → top of the range. Advisory verdicts run
high by default; the whole point of the role is reasoning depth.

Each carrier takes it differently (`effort_syntax` on the cell): a suffix in the
model name, `--thinking`, `--effort`, or no knob at all. A carrier with no knob
cannot honor the floor — note it and pick accordingly when the task is hard.

## anthropic family — the floor

- Not vendor dispatch: Agent-tool subagent on this session's quota.
- **Route**: needs the loaded ecosystem (hooks/skills/session), Anthropic
  models specifically, or every carrier in the chain failed.
