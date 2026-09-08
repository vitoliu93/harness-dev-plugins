# Agent route config

## Location

Read `${AGENTS_CONFIG:-${CCOBS_DIR:-$HOME/.claude/observability}/agents/agents.json}`.
This is personal machine state. Do not commit it and do not put API keys in it.

## Shape

```json
{
  "version": 1,
  "default_transport": "herdr",
  "agents": {
    "example": {
      "description": "水桶型。厂商 X 的主力（$5/$25），样样都行，没有明显短板。",
      "routes": [
        {
          "id": "provider:example-model",
          "channel": "provider",
          "kind": "pi",
          "cli": "pi",
          "model": "provider/example-model",
          "use": "normal",
          "access": "subscription or API provider"
        }
      ]
    }
  }
}
```

## Adding an agent

Search the web for the model first — release notes, price per million tokens,
benchmarks. Never write `description` from memory: a model released after your
cutoff is guessed, and a wrong price sends work to the wrong agent.

Then write one line: tier word, price, and the one trait that decides when to
reach for it. Tier words, cheapest last:

| 档 | 一句话 |
|---|---|
| 攻坚型 | 最贵最强，啃硬骨头 |
| 水桶型 | 样样都行，日常主力 |
| 快手型 | 又快又省，中等难度扛得住 |
| 工兵型 | 最便宜最快、听话，干说得清的简单活 |

The line describes the model, not the job. Which role uses which agent lives in
the team files.

## Read order

1. Resolve the requested alias.
2. Ignore a route whose quota reset time is still in the future.
3. Prefer the first available `normal` route.
4. A later `normal` route is a normal choice, not an emergency path.
5. Use a `fallback` route only when normal routes are unavailable.
6. Confirm `command -v <cli>` and the exact model before starting.

Do not store roles, task types, dated status, quota pools, or fallback logic
outside the ordered route list.
