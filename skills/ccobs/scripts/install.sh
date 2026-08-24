#!/usr/bin/env bash
# ccobs bootstrap — macOS (arm). Idempotent; run on any new machine to get the
# observability pipeline running: bun + dirs + launchd hourly ingest→distill→rollup
# + first sweep. rollup rides the same job on purpose: it calls a model, so it
# cannot live on the Stop hook (obs-enqueue there gets 5 seconds).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OBS_DIR="${CCOBS_DIR:-$HOME/.claude/observability}"
PLIST="$HOME/Library/LaunchAgents/com.vito.ccobs.ingest.plist"
LABEL="com.vito.ccobs.ingest"

if ! command -v bun >/dev/null 2>&1; then
  echo "ccobs: bun not found, installing via bun.sh..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
BUN="$(command -v bun)"

mkdir -p "$OBS_DIR" "$HOME/Library/LaunchAgents"

# Every model call goes out through pi, and pi reads provider keys from the
# environment. launchd hands the job an empty env, so the job runs under zsh
# (below) — zsh sources ~/.zshenv for EVERY invocation, interactive or not,
# which is where the keys and PATH live. Nothing is baked into the plist.
LLM_JSON="$OBS_DIR/llm.json"
if [ ! -f "$LLM_JSON" ]; then
  echo "ccobs: 警告 — 没有 $LLM_JSON，distill 和 rollup 会跳过。写一份就能跑，值是 pi 的 provider/model[:思考档]："
  echo '  {"default": "openrouter/openai/gpt-5.6-luna:low", "distill": "deepseek/deepseek-v4-flash", "rollup": "deepseek/deepseek-v4-flash:off"}'
else
  # Readiness is per provider and machine-local. Check the default one; a
  # missing key is worth a warning, not a failed bootstrap.
  DEFAULT_PROVIDER="$(sed -n 's/.*"default"[^"]*"\([^/]*\)\/.*/\1/p' "$LLM_JSON" | head -1)"
  if [ -n "$DEFAULT_PROVIDER" ] && command -v pi >/dev/null 2>&1; then
    pi auth check --provider "$DEFAULT_PROVIDER" --json 2>/dev/null | grep -q '"status":"ready"' \
      || echo "ccobs: 警告 — pi 里 provider '$DEFAULT_PROVIDER' 没就绪，跑 'pi auth check --provider $DEFAULT_PROVIDER --json' 看详情"
  fi
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-c</string>
    <string>"${BUN}" "${SCRIPT_DIR}/ingest.ts" &amp;&amp; "${BUN}" "${SCRIPT_DIR}/distill.ts" &amp;&amp; "${BUN}" "${SCRIPT_DIR}/rollup.ts"</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${OBS_DIR}/ingest.log</string>
  <key>StandardErrorPath</key><string>${OBS_DIR}/ingest.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "ccobs: launchd job '${LABEL}' installed (hourly + at load → ${OBS_DIR}/ingest.log)"
echo "ccobs: running first sweep..."
"$BUN" "${SCRIPT_DIR}/ingest.ts"
