# LLM call contract

## Configuration

Shared API-direct LLM config, first hit wins (same resolution as ccobs `distill.ts`):

1. `${CCOBS_DIR:-$HOME/.claude/observability}/llm.json` — `{"base_url","model","api_key"}`; machine-local, never committed.
2. `DEEPSEEK_API_KEY` (required at this rung) + optional `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`) and `DEEPSEEK_MODEL` (default `deepseek-v4-flash`).

Neither present → exit 2, unless the request carries its own `api_key`.
Request-level `model`, `base_url`, and `api_key` override both rungs.

Install the OpenAI SDK once, globally, before the first call:

```bash
bun add -g openai@7
```

The runner imports `openai` from the global Bun install; the skill directory
carries no `package.json`, `node_modules`, or lockfile.

## Request

Write one JSON object to stdin:

```json
{
  "messages": [
    {"role": "system", "content": "Return JSON."},
    {"role": "user", "content": "Classify this input."}
  ],
  "model": "deepseek-v4-flash",
  "max_tokens": 32768,
  "temperature": 0,
  "response_format": "json_object"
}
```

Required:

- `messages` — non-empty `system`, `user`, or `assistant` messages. `content` is
  either a non-empty string or an array of provider-shaped content blocks, each
  carrying a non-empty `type`.

Optional:

- `model` — overrides `DEEPSEEK_MODEL`.
- `base_url` — routes this one request to another provider; requires `model`.
- `api_key` — credential for that request; overrides the resolved config.
- `max_tokens` — 1 to 65536; defaults to `32768`.
- `temperature` — omitted unless supplied.
- `response_format` — `text` or `json_object`; defaults to `text`.

## Multimodal and per-request routing

Content blocks pass through unvalidated beyond `type` — the provider is the
authority on block shape. Pair them with a vision model and its provider:

```json
{
  "messages": [
    {"role": "user", "content": [
      {"type": "text", "text": "Describe this screenshot."},
      {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBOR…"}}
    ]}
  ],
  "model": "openai/gpt-5.6-luna",
  "base_url": "https://openrouter.ai/api/v1",
  "api_key": "<OPENROUTER_API_KEY>",
  "max_tokens": 2048
}
```

Resolution order for the effective provider: request `base_url`/`api_key` >
`llm.json` > `DEEPSEEK_*` env > built-in defaults.

## Reasoning effort

Every request sends `thinking.type=enabled` and `reasoning_effort=max`, and the
default `max_tokens` keeps the thinking budget large. Callers cannot select a
lower tier.

## Response

The runner writes one JSON object to stdout:

```json
{
  "model": "deepseek-v4-flash",
  "reasoning_effort": "max",
  "content": "{\"label\":\"pass\"}",
  "finish_reason": "stop",
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 128,
    "total_tokens": 170,
    "reasoning_tokens": 96
  }
}
```

The envelope omits private reasoning text. `reasoning_tokens` is included only
when the provider reports it.

Retry once after network errors, empty content, HTTP 408/409/429, or 5xx. Fail
other 4xx responses immediately.

Exit codes:

- `0` — valid completion;
- `2` — invalid input, missing configuration, API failure, or empty content.

## Tests

```bash
bun test <llm-call-dir>/scripts/call.test.ts
```
