# Reflection methodology — why this skill works the way it does

This skill exists because **letting cc reflect on cc's own behavior is intrinsically biased**, and naive "review your day" prompts produce fluent but useless self-evaluation. The workflow below is engineered around three findings from 2024-2026 LLM research.

## The three failure modes this skill prevents

### 1. Self-critique amplifies self-bias

When the same model generates and critiques, self-evaluation **monotonically inflates** without improving correctness. On simple tasks where the model is already correct, self-critique **reduces accuracy by 15-40%** because the critic hallucinates flaws to justify its role. In iterative self-refinement loops, the generator exploits the evaluator's vulnerabilities — scores rise while quality stagnates or worsens.

Source: Snorkel AI "The Self-Critique Paradox"; arXiv 2310.18679 (N-Critics).

**Implication:** Never let the main agent be its own judge. The critic pass MUST use a different model instance (Opus second-opinion subagent) or a different vendor (ask-ai in codex mode).

### 2. Premature commitment

LLMs lock in answers well before the chain-of-thought completes. Subsequent tokens become post-hoc rationalization; new information is absorbed into the existing conclusion rather than revising it. All major LLMs are overconfident by 20-60%.

Source: arXiv 2605.24396 "Understanding and Mitigating Premature Confidence"; arXiv 2505.02151 "LLMs are Overconfident and Amplify Human Bias".

**Implication:** Forbid high-confidence words ("显然", "肯定", "根因是") unless 3 alternative hypotheses are listed and explicitly ruled out. Alternatives-generation is more robust than self-critique because it doesn't require the model to judge truth.

### 3. Homogeneous-pool echo chamber

Multi-agent setups with identical models converge prematurely and amplify shared biases. Devil's advocate **role assignment** lifts disagreement rate from 48% to 99% — but only when the critic is forced to *attack*, not to *evaluate*. Frameworks that ask "evaluate this report" reproduce the self-bias above.

Source: OpenReview "Inducing Disagreement in Multi-Agent LLM Executive Teams"; arXiv 2405.09935 (DEBATE).

**Implication:** The critic prompt must say "Assume there are 3 worst errors. Find them." — not "review this report".

## Workflow rules (binding)

These rules are not suggestions. Follow them literally.

### Rule 1 — Every finding cites verbatim evidence

Every claim in the report MUST be backed by:
- `session_id` (UUID from the JSONL filename)
- ISO timestamp
- Verbatim user or assistant quote (≤240 chars)

No claim without all three. "vito often pushes back on tool choices" without quotes is forbidden. Use the `friction_moments` array from scan output as the primary evidence source.

### Rule 2 — Alternatives before commitment

For any conclusion of the form "the root cause is X" or "the pattern is Y", first write:

> Alternative hypotheses considered:
> 1. <alt 1> — ruled out because <evidence>
> 2. <alt 2> — ruled out because <evidence>
> 3. <alt 3> — ruled out because <evidence>

If three plausible alternatives cannot be generated, the conclusion is not strong enough to include. Demote to "observation" without causal claim.

### Rule 3 — Both "fortify" and "fix"

Equal weight to:
- **Patterns to fortify** — what worked, should be preserved (e.g., specific prompt phrasings, tool sequences, workflow shapes). Source these from sessions with zero pushbacks and short total duration.
- **Patterns to fix** — what failed, should be changed (CLAUDE.md update / new hook / new skill / workflow change). Source from `friction_moments`.

Reports with only "fix" sections drift toward negative self-criticism without learning from successes.

### Rule 4 — Cross-model critic pass

After drafting the report, MUST invoke one of:

- `second-opinion` subagent — Opus 4.7 in fresh context (heterogeneous instance, same model family but no shared context — partial mitigation).
- `ask-ai` skill, `codex` mode — OpenAI GPT-5.5 (full cross-vendor — strongest mitigation, preferred).

Critic prompt template (literal):

> 下面这份复盘报告**假设有 3 个最严重的错误或盲区**——可能是：
> (a) cc 在为自己开脱（把 cc 的失败包装成"系统问题"或"vito 没说清楚"），
> (b) 缺乏证据的结论被当作事实，
> (c) 真正反复出现的高频问题被埋在低频问题里，
> (d) 把"vito 的工作风格"误读成"vito 做错了"。
> 找出这 3 个错误，给出具体反例 / 证据 / counter-quote。
> 如果你找不出 3 个，再读一遍——报告越流畅越可疑。

Report MUST include a "Critic 摘要" section showing:
- What critique was raised
- For each: accepted (and report modified) / rejected (and why) / unresolved disagreement (explicit)

### Rule 5 — Historical comparison

Before writing the new report, check `~/.claude/reflections/` for the most recent previous report. For each finding in the new report, tag:
- `[首次出现]` — new this period
- `[反复出现 N 次]` — appeared in N of last reports, and why prior fix didn't work
- `[已改善]` — was in prior report, now reduced/absent

Reports without historical tags drift toward "rediscovering the same problems weekly".

## Anti-patterns to avoid in the report

See `anti-patterns.md` for concrete bad examples.

## Output structure

See `report-template.md` for the canonical report layout.

## When the research says self-critique IS useful

Self-critique works **when initial accuracy is low + task is hard + external verification exists**. Reflection on cc usage meets none of these: there is no ground truth for "was that a good collaboration", and the model rating itself starts from high (groundless) confidence. This is why the cross-model critic is non-optional.
