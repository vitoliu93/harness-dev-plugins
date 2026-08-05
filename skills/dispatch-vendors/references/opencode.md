> **非现役 carrier** — 不在 vendor 名单（见 ../SKILL.md）。保留 CLI 备忘；重新启用前跑完 vendor-onboarding 十级梯子。

# opencode — Volcengine coding-plan backend

Quota: Volcengine coding plan — independent of Anthropic and DeepSeek.

```bash
source ~/.zshenv && opencode run "<brief>" -m volcengine-plan/kimi-k2.7-code --format json --auto
source ~/.zshenv && opencode run -s <session-id> "<consolidated fix list>" --format json --auto
```

- Model: `-m provider/model`, provider `volcengine-plan` (`~/.config/opencode/opencode.json`). **Verdicts are per CLI×model, not per CLI**: `kimi-k2.7-code` — **unsupported** (stable 0-token silent no-op even with `--auto`); `glm-5.2` — supported; obey output-cap discipline below; `doubao-seed-2.0-pro` — supported incl. vision. Also lists `deepseek-v4-{flash,pro}`, `minimax-{m2.7,m3}` etc., status unknown until probed. `--variant high|max|minimal` = reasoning effort.
- Output: `--format json`; session id = `sessionID` field on JSON event lines.
- Resume: `-s/--session <id>` · `-c/--continue` · `--fork` (needs `-s` or `-c`) · `--title <t>`.
- **`--auto` required for ANY tool-using task — including read-only review**. Without it: `step_finish` with 0 tokens, exit 0 (silent no-op).
- Silent-failure tell: `step_finish` with `"tokens": {"total": 0}` = FAIL — re-dispatch fresh session or fail over model.
- **Output cap ~4096 tokens per turn** — long reports truncate (`reason: "unknown"`). Brief must demand compact output or write report to file and confirm path.
- Read-only recon: `--agent plan` (also `build`, `explore`, `general`); permissions config-based per agent.
- Working dir: inherits cwd (`--dir` is remote-attach only).
- Attach files: `-f/--file <path>`.
