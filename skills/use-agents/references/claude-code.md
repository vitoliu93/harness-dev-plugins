# Claude Code carrier

Use the Claude subscription through the `claude` binary.

## Check

```bash
command -v claude
claude --help
```

Always pass the model from `agents.json`. Choose effort separately.

```bash
claude -p '<prompt>' --model <model> --effort <level> \
  --output-format stream-json --verbose
```

## Herdr

- Herdr kind: `claude`.
- Pass `PROMPT_FORGE=0` on `herdr tab create --env`; the prompt is already the
  complete instruction.
- Pass native Claude arguments after `herdr agent start ... --`.

## Warnings

- `stream-json` with `-p` needs `--verbose`.
- Unattended edits need an isolated worktree and an explicit permission mode.
- Resume with `--resume <session-id>`; do not guess the newest session.
- A quota message is route-specific. Save its reset hint through
  [quota.md](quota.md); do not mark every Claude model unavailable.
