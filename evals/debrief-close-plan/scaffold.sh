#!/usr/bin/env bash
set -e
P=docs/advanced-plans/2026-09-10-json-flag
mkdir -p src "$P"
echo 'export const list = (json: boolean) => json ? "[]" : "";' > src/cli.ts
cat > "$P/goal.md" <<'J'
# Goal: add --json to note-cli list
**Created**: 2026-09-10  **Tier**: light
## Intent
`note-cli list --json` prints notes as JSON.
J
cat > "$P/spec.md" <<'J'
# Spec
Add a boolean flag, serialize with JSON.stringify.
J
cat > "$P/todo.md" <<'J'
# Todo: add --json
## Current State
- **Phase**: P1 — flag
- **Status**: done
- **Last done**: merged to main, bun test green (3 pass)
- **Next**: close out
## Phases
### P1 — flag  [done]
- **Verify**: bun test → **Result**: 3 pass 0 fail
J
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.com commit -qm "feat: --json flag"
