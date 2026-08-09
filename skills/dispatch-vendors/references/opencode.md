> **非现役 carrier** — 不在 vendor 名单（见 ../SKILL.md）。保留 CLI 备忘；重新启用前跑完 vendor-onboarding 十级梯子。

# opencode — Volcengine coding-plan backend

Quota: Volcengine coding plan — independent of Anthropic and DeepSeek.

```bash
source ~/.zshenv && opencode run "<brief>" -m volcengine-plan/kimi-k2.7-code --format json --auto
source ~/.zshenv && opencode run -s <session-id> "<consolidated fix list>" --format json --auto
```

- Model: `-m provider/model`; configure provider `volcengine-plan` in `~/.config/opencode/opencode.json`.
- Record verdicts per CLI×model — the entries below are examples of the ledger habit; the live fleet lives in the vendor manifest (schema: [vendor-manifest.schema.md](vendor-manifest.schema.md)). `kimi-k2.7-code` was unsupported (0-token no-op); `glm-5.2` supported with the output cap below; `doubao-seed-2.0-pro` supports vision.
- Treat listed `deepseek-v4-{flash,pro}` and `minimax-{m2.7,m3}` models as unknown until probed.
- Set reasoning effort with `--variant high|max|minimal`.
- Output: `--format json`; session id = `sessionID` field on JSON event lines.
- Resume: `-s/--session <id>` · `-c/--continue` · `--fork` (needs `-s` or `-c`) · `--title <t>`.
- **`--auto` required for ANY tool-using task — including read-only review**. Without it: `step_finish` with 0 tokens, exit 0 (silent no-op).
- Silent-failure tell: `step_finish` with `"tokens": {"total": 0}` = FAIL — re-dispatch fresh session or fail over model.
- **Output cap ~4096 tokens per turn** — long reports truncate (`reason: "unknown"`). Brief must demand compact output or write report to file and confirm path.
- Read-only recon: `--agent plan` (also `build`, `explore`, `general`); permissions config-based per agent.
- Working dir: inherits cwd (`--dir` is remote-attach only).
- Attach files: `-f/--file <path>`.
