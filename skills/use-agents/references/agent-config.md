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

## Read order

1. Resolve the requested alias.
2. Ignore a route whose quota reset time is still in the future.
3. Prefer the first available `normal` route.
4. A later `normal` route is a normal choice, not an emergency path.
5. Use a `fallback` route only when normal routes are unavailable.
6. Confirm `command -v <cli>` and the exact model before starting.

Do not store roles, task types, dated status, quota pools, or fallback logic
outside the ordered route list.
