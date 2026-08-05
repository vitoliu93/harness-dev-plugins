# Semantic style review contract

## Boundary

Run `skill-forge/scripts/skill_style.py` before this review. It owns exact checks:
description shape, portable paths, fixed runtime IDs, orphan surfaces, and
paragraph length. This skill owns meaning-dependent judgments.

Send only skill Markdown and its current Git diff to DeepSeek. The runner
redacts credential-shaped literals before transmission.

## Blocking categories

- `origin-story` — explains who created or migrated a rule instead of stating
  the current rule.
- `incident-lore` — uses a past failure or dramatic anecdote as runtime
  guidance instead of condition → action → evidence.
- `tuition-narrative` — justifies a rule through pain, cost, or lessons learned.
- `marketing-language` — uses hype, superlatives, or persuasive claims instead
  of capability, limit, or acceptance evidence.
- `prose-wall` — mixes multiple executable decisions in dense prose that should
  be a checklist, table, or condition branch.
- `gate-loss` — removes or weakens a safety, lifecycle, verification, or
  escalation gate while shortening documentation.

Do not flag:

- a date that selects a live API version, retention window, compatibility
  branch, or migration cutoff;
- a literal shown only as a negative example or category definition;
- concise rationale required to choose between two current branches;
- product names or factual capability claims with an observable check.

Every reported issue blocks the semantic review. Do not emit advisory findings.
The local runner keeps `gate-loss` only when its evidence appears in deleted Git
lines; once grounded, the false-positive adjudicator cannot discard it.

## Configuration

- `LLM_CALL_RUNNER` — optional path to `llm-call/scripts/call.ts`; otherwise
  resolve it from `CLAUDE_PLUGIN_ROOT` or the packaged sibling skill.
- `SKILL_STYLE_EFFORT` — optional; defaults to `max` for one skill or evals and
  `none` for a workspace first pass.
- `SKILL_STYLE_ADJUDICATION_EFFORT` — optional; defaults to `max`.
- `DEEPSEEK_STYLE_MODEL` — optional; defaults to `deepseek-v4-flash`.
- `SKILL_STYLE_MAX_CHARS` — optional maximum characters per request chunk;
  defaults to `30000`.
- `SKILL_STYLE_MAX_TOKENS` and `SKILL_STYLE_ADJUDICATION_MAX_TOKENS` — optional;
  both default to `8192`.

The `llm-call` atom owns Bun/OpenAI installation and all `DEEPSEEK_*`
configuration. This skill sends JSON through stdin. Max increases the
thinking-token budget for focused judgment; None keeps fleet scans bounded.

## CLI

Review one skill:

```bash
LLM_CALL_RUNNER=<llm-call-runner> \
  bun scripts/review.ts --skill-dir <skill-dir> --fail-on-issues
```

Review every discovered skill:

```bash
LLM_CALL_RUNNER=<llm-call-runner> SKILL_STYLE_EFFORT=none bun scripts/review.ts \
  --workspace-root <skills-root> \
  --output <report.json> \
  --fail-on-issues
```

Use `--dry-run` to print the redacted payload without making a request.

After changing the review or adjudication prompt, run the fixed semantic
regression:

```bash
LLM_CALL_DIR=<llm-call-dir>
bun install --cwd $LLM_CALL_DIR --frozen-lockfile
LLM_CALL_RUNNER=$LLM_CALL_DIR/scripts/call.ts \
  bun scripts/review.ts --eval-cases evals/semantic_cases.json
```

Exit codes:

- `0` — review passed, or findings exist without `--fail-on-issues`;
- `1` — semantic findings exist with `--fail-on-issues`;
- `2` — invalid input, missing configuration, or API/response failure.

## Report shape

```json
{
  "ok": false,
  "model": "deepseek-v4-flash",
  "effort": "max",
  "adjudication_effort": "max",
  "reviewed_at": "RFC3339 timestamp",
  "skill_count": 1,
  "issue_count": 1,
  "skills": [
    {
      "skill": "example-skill",
      "files": 3,
      "issues": [
        {
          "file": "SKILL.md",
          "line": 24,
          "category": "incident-lore",
          "evidence": "exact source excerpt",
          "reason": "why it weakens runtime guidance",
          "rewrite": "imperative replacement"
        }
      ]
    }
  ]
}
```
