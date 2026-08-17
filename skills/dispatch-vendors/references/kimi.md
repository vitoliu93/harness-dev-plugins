# kimi — Kimi Code CLI (k3 / K2.7)

Native carrier for kimi models (slot model per vendor manifest). Quota: user's Kimi Code subscription — a small pool, spend it on long reads. No effort knob: the model runs at a fixed level, so the manifest effort floor cannot be honored here.

```bash
kimi -p "<brief>" --output-format stream-json
kimi -p "<question>" --plan --output-format stream-json
kimi -S session_<uuid> -p "<consolidated fix list>" --output-format stream-json
```

## Launch

- Bare binary on PATH — no `zsh -ic`, no `source ~/.zshenv`.
- No `--timeout` — use shell watchdog for long runs.
- Headless `-p` with stock config auto-approves Read/Write/Bash — always dispatch into a git worktree.

## Output

- Formats: `text` or `stream-json` only (no plain `json`).
- Session id: last line `type:"session.resume_hint"` → `.session_id` (also `.command` for resume).
- Redirected stdout is **block-buffered until exit** — watch wire file, not stdout polling.
- SIGTERM may flush partial JSONL if a message completed; missing `session.resume_hint` = truncated run.
- stderr is never an error signal; never `2>&1`. Vendor Bash stdout may leak to CLI stderr.

## Liveness

Wire: `~/.kimi-code/sessions/wd_<cwd>_<hash>/session_<uuid>/agents/main/wire.jsonl`
- Grows per completed message, not during one long generation.
- Fat wire + dead process → resume with `-S` to harvest.

## Resume

- `-S session_<uuid>` — primary
- `-r <id>` — hidden alias (works)
- `-c` — latest in cwd

## Vision

k3 supports PNG/image read via tools. Image base64 inflates stdout — always redirect.

## Models

- Default `kimi-code/k3` (1M ctx, thinking)
- `kimi-code/kimi-for-coding` (K2.7) — failover with k3
- `kimi provider list` / `-m <alias>` to pick

## Long tasks

- Brief: require deliverable file created early (skeleton first).
- Timeouts ≥10 min for review-class tasks, or monitor wire.jsonl size.
- After kill: narrow `-S` resume ("write file from notes") to harvest.
- Keep post-resume asks narrow on fat sessions.

## Scope

- `--skills-dir <dir>` — replace auto-discovered skills (empty dir for hermetic runs)
- `--add-dir <dir>` — extra scope
