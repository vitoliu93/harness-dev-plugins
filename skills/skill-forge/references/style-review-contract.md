# Semantic style review contract

## Boundary

Run `skill-forge/scripts/skill_style.ts` before this review. It owns exact checks:
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

- Model comes from `${CCOBS_DIR:-$HOME/.claude/observability}/llm.json`, key
  `skill-style-review`, falling back to `default`. Missing both fails the run.
- `SKILL_STYLE_MODEL` — optional; beats the config file.
- `SKILL_STYLE_MAX_CHARS` — optional maximum characters per request chunk;
  defaults to `30000`.
- `SKILL_STYLE_TIMEOUT_MS` — optional wall-clock cap per call; defaults to
  `300000`. pi has no `--timeout`, so the child is killed by the caller.

The call goes out through the shared `pi-call` layer, which spawns `pi -p`
headless; pi owns provider credentials. The system prompt replaces pi's own
prompt, so the "return JSON only" instruction is uncontested — there is no
`response_format` flag to set.

## CLI

Review one skill:

```bash
bun "$FORGE/style_review.ts" --skill-dir <skill-dir> --fail-on-issues
```

Review every discovered skill:

```bash
bun "$FORGE/style_review.ts" \
  --workspace-root <skills-root> \
  --output <report.json> \
  --fail-on-issues
```

Use `--dry-run` to print the redacted payload without making a request.

After changing the review or adjudication prompt, run the fixed semantic
regression:

```bash
bun "$FORGE/style_review.ts" --eval-cases "$SKILL_FORGE_DIR/evals/style_review_cases.json"
```

Exit codes:

- `0` — review passed, or findings exist without `--fail-on-issues`;
- `1` — semantic findings exist with `--fail-on-issues`;
- `2` — invalid input, missing configuration, or API/response failure.

## Tests

```bash
bun test skills/skill-forge/scripts/style_review.test.ts
```

This skill carries no `package.json`, `node_modules`, or lockfile; the runner
uses only Bun and Node built-ins.

## Report shape

```json
{
  "ok": false,
  "model": "deepseek-v4-flash",
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
