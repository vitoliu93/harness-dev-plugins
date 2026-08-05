# LLM call contract

## Configuration

- `DEEPSEEK_API_KEY` — required.
- `DEEPSEEK_BASE_URL` — optional; defaults to `https://api.deepseek.com`.
- `DEEPSEEK_MODEL` — optional; defaults to `deepseek-v4-flash`.

Install the locked OpenAI SDK dependency before the first call:

```bash
bun install --cwd <llm-call-dir> --frozen-lockfile
```

## Request

Write one JSON object to stdin:

```json
{
  "messages": [
    {"role": "system", "content": "Return JSON."},
    {"role": "user", "content": "Classify this input."}
  ],
  "model": "deepseek-v4-flash",
  "effort": "max",
  "max_tokens": 8192,
  "temperature": 0,
  "response_format": "json_object"
}
```

Required:

- `messages` — non-empty `system`, `user`, or `assistant` messages with text content.

Optional:

- `model` — overrides `DEEPSEEK_MODEL`.
- `effort` — `none`, `high`, or `max`; defaults to `max`.
- `max_tokens` — defaults to `8192` for `max`, otherwise `4096`.
- `temperature` — omitted unless supplied.
- `response_format` — `text` or `json_object`; defaults to `text`.

## Effort mapping

| Input | DeepSeek request | Use |
|---|---|---|
| `none` | `thinking.type=disabled` | deterministic extraction or lowest latency |
| `high` | `thinking.type=enabled`, `reasoning_effort=high` | balanced reasoning |
| `max` | `thinking.type=enabled`, `reasoning_effort=max` | increased thinking-token budget |

DeepSeek maps lower thinking tiers to `high` and xhigh-style tiers to `max`.
Expose only the three stable runtime choices above.

## Response

The runner writes one JSON object to stdout:

```json
{
  "model": "deepseek-v4-flash",
  "effort": "max",
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
