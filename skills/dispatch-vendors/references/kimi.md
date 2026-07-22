> ⚠️ **下舰存档(2026-07-22)** — 不在现役 vendor 名单(名单见 ../SKILL.md),留档供重新上舰或历史排查参考。

# kimi — Kimi Code CLI (k3 / K2.7, Moonshot quota)

Flags AND live behavior verified 2026-07-20 (`--help` + full onboarding ladder:
text/permission/resume/liveness/vision/output/model probes + a real write task
and a real red-team task, all headless). Quota: the user's own Kimi Code
subscription — **foreign pool + k2/k3 model family when the main session is
Claude Code (D+Q double win); same pool when the main session IS Kimi Code
(then it's parallelism only, not diversity)**. Also: the opencode ×
kimi-k2.7-code cell is 禁用 (0-token no-op ×3) — this native CLI is the
working path to kimi models.

```bash
kimi -p "<brief>" --output-format stream-json            # write task (headless = fully autonomous, see below)
kimi -p "<question>" --plan --output-format stream-json  # read-only recon analog
kimi -S session_<uuid> -p "<consolidated fix list>" --output-format stream-json   # fix round
```

- Bare binary on PATH — **no `zsh -ic` wrapper, no `source ~/.zshenv`** (oauth
  self-contained). No `--timeout` flag — wrap with a shell watchdog.
- **Permissions: with a stock config (no permission keys in
  ~/.kimi-code/config.toml) `-p` headless auto-approves EVERYTHING** — Read,
  Write, AND Bash, zero flags needed (all three verified live). `-y/--yolo` /
  `--auto` exist but are redundant on this fleet. Corollary: headless = fully
  autonomous, always dispatch into a `git worktree`.
- Output: **no plain `json` format — only `text|stream-json`**. stream-json =
  JSONL events: assistant msgs, `tool_calls`, `tool` results, and a final meta.
  **Session id: the LAST line's meta event, `type:"session.resume_hint"` →
  `.session_id` (and `.command` is a ready-made resume command).** Default
  `text` format puts thinking + the resume hint on stderr; stream-json keeps
  stderr clean of those — **but a vendor's Bash-tool stdout leaks onto the
  CLI's stderr** (verified). stderr is never an error signal; never `2>&1`.
- **stdout redirected to a file is block-buffered — flushes at process exit,
  NOT streaming** (verified: 195s of polling showed 0 bytes, content appeared
  only at exit/kill). Don't watch stdout for progress; watch the wire file.
  SIGTERM flushes buffered events IF any message already completed (killed
  mid-first-event → literally zero bytes, verified); a killed run's truncated
  final message is still valid JSONL — **truncation tell = missing
  `session.resume_hint` meta line + text ending mid-sentence**.
- Liveness backdoor: `~/.kimi-code/sessions/wd_<cwd-basename>_<hash>/session_<uuid>/`
  — `agents/main/wire.jsonl` (full conversation, ~110KB baseline),
  `state.json` (createdAt/updatedAt/title/lastPrompt), `logs/kimi-code.log`.
  **wire.jsonl grows per completed message — it does NOT grow during one long
  generation** (verified: constant size across a 115s essay). Fat wire + dead
  process = work done, output unharvested → resume with `-S` to collect.
- Resume: `-S session_<uuid>` ✅ context alive (verified); **`-r <id>` is a
  hidden alias** (not in `--help`, but the resume_hint advertises it) ✅;
  `-c` continues latest-in-cwd ✅.
- **Vision: YES on k3** (verified: PNG transcription exact, colors/shapes
  right, even caught a caption that lied about the image). Caveat: the image's
  base64 lands INLINE in the tool event → stdout balloons; always redirect.
  kimi-for-coding declares `image_in` but is unprobed.
- Output ceiling: none hit at 1842 words / ~12KB single message (contrast
  opencode's ~4096-token cap). Long single generations are slow though:
  ~115-120s for 1500-1800 words on k3 (always-thinking). Write-to-file
  discipline is still recommended — against kill-truncation, not caps.
- Models: default `kimi-code/k3` (1M ctx, thinking) ✅ tool use/long-form/
  vision all verified. `kimi-code/kimi-for-coding` (K2.7 Coding) ✅ read-task
  probe clean in ~5s. Both healthy — failover k3 ↔ kimi-for-coding.
  `-m <alias>` to pick; `kimi provider list` shows what's configured.
- Scale/endurance verified: 7-file adversarial security review (multi-step tool
  use, findings empirically verified by the vendor, 4/4 spot-checks reproduced
  by us — including the exact `exit=5` it claimed) delivered a 12.7KB ranked
  report. Small write task (bash test suite in a real git worktree) passed our
  own acceptance 5/5 first try, zero collateral files.
- **Timeout discipline (verified the hard way): k3's always-thinking +
  thorough self-verification burns wall-clock** — the 7-file review blew a
  560s budget while still verifying (deliverable-at-end pattern = killed with
  NOTHING on disk), and a 280s fix round on the fat resumed session flushed
  zero bytes (killed before its first event completed). So: (a) briefs must
  require the deliverable file created EARLY (skeleton first, fill
  incrementally); (b) size timeouts ≥10min for review-class tasks, or watch
  wire.jsonl liveness instead of hard caps; (c) after a kill, `-S` resume with
  "write the file NOW from your notes" harvests cleanly (verified — report
  recovered intact in ~2min); (d) keep resume asks NARROW on fat sessions —
  even a narrow "print the diff" ask took ~355s after resuming the 7-file
  review session (a 280s budget died with zero bytes flushed).
- `--skills-dir <dir>` replaces auto-discovered skills (repeatable) — point at
  an empty dir for hermetic runs; `--add-dir <dir>` for extra scope.
