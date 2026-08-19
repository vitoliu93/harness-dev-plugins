---
name: llm-call
description: >-
  Call a configured language model with maximum reasoning effort and structured output.
  Use when a skill needs direct model inference without vendor orchestration.
metadata:
  kind: atom
  requires:
    bins: ["bun"]
    env: ["DEEPSEEK_API_KEY"]
---

# llm-call

## Prerequisites

```bash
bun add -g openai@7
test -f "${CCOBS_DIR:-$HOME/.claude/observability}/llm.json" || test -n "$DEEPSEEK_API_KEY"
```

Send one JSON request through stdin:

```bash
LLM_CALL_SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
printf '%s' '<request-json>' | bun "$LLM_CALL_SKILL_DIR/scripts/call.ts"
```

## Hard gates

- Call the configured provider through the globally installed OpenAI SDK; do not route through `dispatch-vendors`.
- Keep this skill directory dependency-free: no `package.json`, `node_modules`, or lockfile.
- Always request thinking at `reasoning_effort=max`; expose no lower tier.
- Keep prompts and credentials out of argv; pass request data through stdin.
- Route a single request elsewhere with `base_url` + `model` (+ `api_key`) — e.g. a vision model for `image_url` content blocks; the configured provider stays the default.
- Return content, finish reason, model, reasoning effort, and token usage as one JSON envelope.
- Fail on missing credentials, malformed input, empty content, or invalid API output.

Request schema, environment variables, and response schema:
[contract.md](references/contract.md).
