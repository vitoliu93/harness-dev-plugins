#!/usr/bin/env bash
# Fake route table: the first codex route is quota-blocked, so the right pick is the second.
set -e
mkdir -p observability/agents
cat > observability/agents/agents.json <<'J'
{
  "version": 1,
  "default_transport": "herdr",
  "agents": {
    "codex": {
      "description": "水桶型。评估用示例路由。",
      "routes": [
        { "id": "codex:gpt-5.6-sol", "channel": "codex", "kind": "codex", "cli": "codex", "model": "gpt-5.6-sol", "use": "normal", "access": "ChatGPT subscription" },
        { "id": "codex:gpt-5.6-luna", "channel": "codex", "kind": "codex", "cli": "codex", "model": "gpt-5.6-luna", "use": "normal", "access": "ChatGPT subscription" }
      ]
    }
  }
}
J
cat > observability/agents/quota.json <<'J'
{
  "version": 1,
  "routes": {
    "codex:gpt-5.6-sol": {
      "limited_at": "2026-09-14T01:00:00Z",
      "reset_at": "2099-01-01T00:00:00Z",
      "reset_hint": null,
      "message": "You've hit your usage limit"
    }
  }
}
J
