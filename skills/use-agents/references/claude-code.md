# Claude Code carrier

Use the Claude subscription through the `claude` binary.

## Check

```bash
command -v claude
claude --help
```

Always pass the model from `agents.json`. Take `--effort` from the alias's
`effort` field, and drop the flag when that field is empty.

```bash
claude -p '<prompt>' --model <model> --effort <level> \
  --output-format stream-json --verbose
```

## Herdr

- Herdr kind: `claude`.
- Pass native Claude arguments after `herdr agent start ... --`.

## Warnings

- `stream-json` with `-p` needs `--verbose`.
- Unattended edits need an isolated worktree and an explicit permission mode.
- Resume with `--resume <session-id>`; do not guess the newest session.
- A quota message is route-specific. Save its reset hint through
  [quota.md](quota.md); do not mark every Claude model unavailable.
