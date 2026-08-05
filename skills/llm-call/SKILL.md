---
name: llm-call
description: >-
  Call a configured language model with explicit reasoning effort and structured output.
  Use when a skill needs direct model inference without vendor orchestration.
disable-model-invocation: true
metadata:
  kind: atom
  requires:
    bins: ["bun"]
    env: ["DEEPSEEK_API_KEY"]
---

# llm-call

## Prerequisites

```bash
LLM_CALL_DIR=${CLAUDE_SKILL_DIR:?set llm-call base directory}
bun install --cwd "$LLM_CALL_DIR" --frozen-lockfile
test -n "$DEEPSEEK_API_KEY"
```

Send one JSON request through stdin:

```bash
printf '%s' '<request-json>' | bun "$LLM_CALL_DIR/scripts/call.ts"
```

## Hard gates

- Call DeepSeek through the OpenAI SDK; do not route through `dispatch-vendors`.
- Default `effort` to `max`: enable thinking and increase the thinking-token budget.
- Use `high` for the balanced thinking tier and `none` for no thinking.
- Keep prompts and credentials out of argv; pass request data through stdin.
- Return content, finish reason, model, effort, and token usage as one JSON envelope.
- Fail on missing credentials, malformed input, empty content, or invalid API output.

Request schema, effort mapping, environment variables, and response schema:
[contract.md](references/contract.md).
