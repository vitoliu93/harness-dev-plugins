# Exa parameter-shape corrections

Distilled from https://exa.ai/docs — the full index is at https://exa.ai/docs/llms.txt,
and each surface has a coding-agent reference under
`https://exa.ai/docs/.mintlify/skills/build-with-exa/references/{search,contents,context,agent,websets}.md`.

| Wrong | Correct |
|---|---|
| `text: true` top-level on `/search` | `"contents": {"text": true}` |
| `highlights: {...}` top-level on `/search` | `"contents": {"highlights": {...}}` |
| `summary: true` top-level on `/search` | `"contents": {"summary": true}` |
| `contents: {text: ...}` on `/contents` | On `/contents` these are top-level fields |
| `tokensNum` on `/search` or `/contents` | Belongs to `/context` only |
| `includeUrls` / `excludeUrls` | `includeDomains` / `excludeDomains` |
| `useAutoprompt` | Deprecated — remove |
| `numSentences` for highlights | `maxCharacters`, or just `highlights: true` |
| `highlightsPerUrl` | Deprecated — remove |
| `livecrawl` in new code | `maxAgeHours` |
| `livecrawl: "true"` | The string silently falls back to `never` |
| Stacking `text` + `highlights` + `summary` | Pick one; `summary` = one LLM call per result |
| `category: "github" \| "documentation" \| "qa" \| "pdf"` | Not real. Use `/context` or `type: "fast"` |
| `stream: true` on `/contents` | Unsupported |
| camelCase in the Python SDK | `num_results`, `max_characters`, `output_schema`, `max_age_hours` |
| `searchParams` on monitors | `search` |
| `schedule: "1h"` on monitors | `trigger: {"type":"interval","period":"1h"}` |

## Shape confusions worth memorizing

- **search vs contents** — search nests under `contents`; contents is top-level.
- **context vs search** — `tokensNum` on context; `contents.text.maxCharacters` on search.
- **category restrictions** — `people` rejects date/crawl-date filters and `excludeDomains`,
  and `includeDomains` there only accepts LinkedIn; `company` rejects date filters but allows
  `excludeDomains`. Bad combinations 400. Push filtering into the natural-language query.
- **`/contents` returns 200 with partial failures** — always read `statuses`.
- **`/agent` `budget.maxCostDollars`** is accepted for compatibility but documented as
  ignored. It is not a spend cap.

## Streaming

`/search` with `stream: true` returns SSE chunks typed `text-delta`, `grounding`,
`results`, `stream-reset`, `done`, `error`. `/agent` streams lifecycle events when
created with `Accept: text/event-stream`, and replays stored events from
`GET /agent/runs/{id}/events` with `Last-Event-ID`. The bundled script does neither —
it buffers, and polls agent runs.
