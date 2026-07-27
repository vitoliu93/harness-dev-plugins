# Exa surfaces — full parameters

All calls: `bun ${CLAUDE_SKILL_DIR}/scripts/exa.ts <path> '<json>'`.
Correction table for wrong shapes: `pitfalls.md`.

## search

```bash
exa.ts search '{"query":"latest LLM inference tricks","contents":{"highlights":true}}'
```

- `type`: `auto` (default) · `fast` · `instant` · `deep-lite` · `deep` · `deep-reasoning`. Code-ish web queries → `fast`.
- Content extraction **nests** under `contents`. Pick one of `text` / `highlights` / `summary`; `highlights: true` is the agent default and auto-sizes the excerpt. `summary` costs one LLM call per result.
- `contents.text` object form: `maxCharacters`, `includeHtmlTags`, `verbosity`, `includeSections`, `excludeSections`.
- Freshness: `contents.maxAgeHours` (`0` = always live crawl, `-1` = cache only), `contents.livecrawlTimeout` (ms).
- Also `contents.subpages`, `contents.subpageTarget`, `contents.extras.links`, `contents.extras.imageLinks`.
- Filters: `numResults` (default 10), `includeDomains` / `excludeDomains` (paths and `*.wildcards` allowed), `userLocation` (ISO-2).
- Structured output: `outputSchema` + `systemPrompt`, works on any `type` — don't pick a `deep` variant just to get JSON. Citations come back in `output.grounding`.
- `category`: only `company`, `people`, `publication`, `news`, `personal site`, `financial report`. `people` rejects date/crawl-date filters and `excludeDomains`, and its `includeDomains` accepts LinkedIn only; `company` rejects date filters. Bad combos 400 — push filtering into the query text instead.

## contents

```bash
exa.ts contents '{"urls":["https://exa.ai/docs"],"highlights":true}'
```

`text` / `highlights` / `summary` are **top-level** here, not under `contents` —
this is the shape difference that bites most. Also `urls` (or `ids` from prior Exa
calls), `maxAgeHours`, `livecrawlTimeout`, `subpages`, `subpageTarget`, `extras`.
No streaming.

A 200 can still carry per-URL failures in `statuses`; the script prints them under
"Failed URLs" rather than dropping them.

## agent

```bash
exa.ts agent '{"query":"Engineering leaders at AI infra companies that raised Series A/B in the last 6 months","effort":"auto","outputSchema":{"type":"object","properties":{"people":{"type":"array","maxItems":10,"items":{"type":"object","properties":{"name":{"type":"string"},"job_title":{"type":"string"},"linkedin_url":{"type":"string","format":"uri"}},"required":["name","job_title","linkedin_url"]}}},"required":["people"]}}'
```

Async (seconds to minutes); the script polls to a terminal status, 15 min cap.

- `effort`: `minimal|low|medium|high|xhigh|auto`.
- `outputSchema`: bound arrays with `maxItems` — enrichment cost scales per item. Contact fields work via standard formats: `{"type":"string","format":"email"|"phone"|"uri"}`.
- `input.data`: existing rows to enrich — pass them here, never pasted into `query`.
- `input.exclusion`: records that shouldn't resurface.
- `previousRunId`: follow up on a **completed** run; returns a new `agent_run_*` id.
- `dataSources`: Exa Connect providers, e.g. `[{"provider":"similarweb"},{"provider":"fiber"}]` (also `baselayer`, `affiliatecom`, `particle`, `financialdatasets`, `jinko`).
- `budget.maxCostDollars` is accepted but documented as ignored — not a spend cap.

Output: `output.text`, `output.structured`, `output.grounding`, `costDollars`.

## websets

**Requires a Pro plan.** On a Personal team every `websets/v0/*` call returns 401
"Upgrade to a Pro plan" — verified 2026-07-27. Don't retry; report it and fall back
to `search` or `agent`.

Async collection-building: search → verify each candidate against `criteria` →
store `items` → optional `enrichments`. Seconds-to-minutes, event-driven.

```bash
# preview query decomposition before committing a resource
exa.ts websets/v0/websets/preview '{"query":"Top AI research labs working on LLMs"}'

exa.ts websets/v0/websets '{"search":{"query":"Top AI research labs working on LLMs","count":5},"enrichments":[{"description":"Founding year","format":"number"}]}'

# no body = GET
exa.ts websets/v0/websets/<id>
exa.ts websets/v0/websets/<id>/items
```

Resource families under `websets/v0`: `websets`, `searches`, `items`, `enrichments`,
`imports`, `webhooks`, `events`, `monitors`. `externalId` makes creates idempotent
across retries. Search payloads take `query`, `count`, optional `entity`, `criteria`
(verification rules), `enrichments` (post-match extraction).

## Anything else

Paths pass straight through, so `monitors`, `answer`, and future endpoints work
without touching the script. Monitors: `trigger: {"type":"interval","period":"1h"}`,
and the search definition goes under `search`, not `searchParams`.
