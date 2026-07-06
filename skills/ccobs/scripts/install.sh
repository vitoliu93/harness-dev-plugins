#!/usr/bin/env bash
# ccobs bootstrap — macOS (arm). Idempotent; run on any new machine to get the
# observability pipeline running: bun + dirs + launchd daily ingest + first sweep.
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

# launchd doesn't inherit shell env — bake the provider keys present at install
# time into the plist so the nightly distill can reach an LLM. Re-run install.sh
# after rotating keys.
ENV_ENTRIES=""
for k in DEEPSEEK_API_KEY GEMINI_API_KEY OPENROUTER_API_KEY LMSTUDIO_API_KEY; do
  v="${!k:-}"
  [ -n "$v" ] && ENV_ENTRIES+="    <key>${k}</key><string>${v}</string>"$'\n'
done

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>"${BUN}" "${SCRIPT_DIR}/ingest.ts" &amp;&amp; "${BUN}" "${SCRIPT_DIR}/distill.ts"</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
${ENV_ENTRIES}  </dict>
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
