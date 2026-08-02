---
name: exa-code
description: Search the web and find code examples, documentation, and programming solutions across GitHub, Stack Overflow, and official docs. Use when the user asks to search for information, find code examples, debug issues, or look up API documentation. Also covers Exa Contents (extract known URLs), Agent (async multi-step research with structured output), and Websets (build verified, enriched entity collections).
---

# Exa

One script fronts every Exa surface. Needs `EXA_API_KEY`.

```
bun ${CLAUDE_SKILL_DIR}/scripts/exa.ts <path> '<json body>'
```

POSTs the body to `https://api.exa.ai/<path>`; omit the body for a GET. `agent` is
shorthand for `agent/runs` and polls the run to completion. Unknown paths pass
straight through, so `monitors`, `answer`, etc. work too.

## Pick the surface

| Ask | Endpoint |
|---|---|
| Code, API usage, library setup | `context` ← default for programming questions |
| General web research, news, entities | `search` |
| You already have the URLs | `contents` |
| Multi-step research, list-building, enrichment | `agent` (async, seconds–minutes) |
| Verified + enriched entity collection over time | `websets/v0/websets` (**Pro plan only**) |

## The two hot paths

```bash
# code — returns formatted markdown context, not a result list
exa.ts context '{"query":"Express.js auth middleware","tokensNum":"dynamic"}'

# web — content extraction nests under `contents`
exa.ts search '{"query":"latest LLM inference tricks","contents":{"highlights":true}}'
```

`tokensNum` is `"dynamic"` (use this) or 50–100000, and exists **only** on `context`.
For code-ish queries that still want ranked web pages, use `search` with `"type":"fast"`.

Full parameters for every surface — filters, structured output, freshness, agent
schemas, websets lifecycle: `references/surfaces.md`.

## Pitfalls

Full correction table: `references/pitfalls.md`. The ones that bite most:

1. `/search` nests content fields under `contents`; `/contents` has them top-level.
2. Never stack `text` + `highlights` + `summary` — double billing, and `summary` is a per-result LLM call.
3. `tokensNum` is `/context`-only; cap search text with `contents.text.maxCharacters`.
4. `category` has a fixed set — **never invent `github`/`docs`/`pdf`**. Use `context` or `type:"fast"` for code.
5. Dead params: `useAutoprompt`, `numSentences`, `highlightsPerUrl`, `includeUrls`/`excludeUrls`. Prefer `maxAgeHours` over `livecrawl`.
6. `/contents` doesn't stream, and returns 200 with partial failures. `/agent` isn't synchronous.
7. **Never fan out search calls in parallel** — 5 concurrent `web_search` = instant HTTP 429 burst (measured 2026-07-30). Serialize or space ≥1s apart; on 429 back off and retry once.
