# Quota state

## Location

Store current quota walls in
`${CCOBS_DIR:-$HOME/.claude/observability}/agents/quota.json`. Create it with
mode `0600`. It contains no API keys.

```json
{
  "version": 1,
  "routes": {
    "provider:model": {
      "limited_at": "2026-01-02T03:04:05Z",
      "reset_at": null,
      "reset_hint": "Try again in a few hours",
      "message": "Original quota message"
    }
  }
}
```

## Update

- Save an exact reset time as ISO 8601 in `reset_at`.
- If the message gives only words, keep them verbatim in `reset_hint`.
- Calculate `reset_at` only from an exact duration. Otherwise keep it `null`.
- Key by route ID. One limited model does not disable its whole CLI.
- Before reset, skip the route. After reset, allow one cheap probe.
- Delete the route entry after a successful probe; otherwise replace it with
  the new message.

Do not guess a reset time and do not probe repeatedly before it.
