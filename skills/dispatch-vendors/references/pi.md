# pi — pi coding agent (multi-provider, API-key backed)

Carrier for google/gemini slots — the fleet's google-family cell. Providers are raw API-key pools; readiness is machine-local: `pi auth check --provider <name> --json`.

```bash
pi -p --mode json --model <provider>/<model> "<brief>"
pi -p --mode json --session <uuid> "<consolidated fix list>"
pi -p --mode json --model <provider>/<model> @screenshot.png "<vision brief>"
```

## Launch

- Bare binary on PATH (bun global) — no `zsh -ic`, no `source ~/.zshenv`.
- Model: `--model provider/id`, optional `:<thinking>` suffix; or `--thinking off|minimal|low|medium|high|xhigh|max`. Catalog: `pi --list-models [search]`.
- **No permission flags exist — headless `-p` auto-runs read/bash/edit/write** — always dispatch into a git worktree.
- Tool scoping is real: `--no-tools` for pure-text advisory; `-t read` allowlist blocks writes (model reports it cannot). No grep/glob built-ins — read-only recon is weak; prefer plan-shaped briefs elsewhere.
- Hermetic runs: `--no-skills --no-extensions --no-context-files` (pi auto-loads AGENTS.md/CLAUDE.md and discovered skills otherwise).
- No `--timeout` — use shell watchdog for long runs.

## Output

- `--mode json` → JSONL event stream on stdout; stderr stays separate and quiet.
- Session id: first line `{"type":"session","id":"<uuid>"}`.
- Assistant text: `text_end` events (`.assistantMessageEvent.content`); full transcript replayed in the final `agent_end` event.
- stdout is line-flushed live under redirection — poll file size for liveness (unlike kimi's block-buffering).

## Liveness

Session file: `~/.pi/agent/sessions/<cwd-slug>/<timestamp>_<uuid>.jsonl` — grows during the run; fat file + dead process → resume to harvest.

## Resume

- `--session <uuid>` — primary; partial UUID accepted.
- `-c` — latest in cwd; `--fork <id>` — branch off; `--no-session` — ephemeral.

## Vision

`@file.png` positional attachment; works on gemini slots. Image base64 inflates the session file, not stdout.

## Auth

- `pi auth check --provider <p> --json` → `{"status":"ready"}` gate before dispatch.
- `pi auth print-api-key --provider <p>` exposes the raw key — never echo into briefs.
