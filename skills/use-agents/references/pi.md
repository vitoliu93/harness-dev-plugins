# pi carrier

`pi` can reach several providers. The provider is part of the route, so always
pass the full `provider/model` value from `agents.json`.

## Check

```bash
command -v pi
pi auth check --provider <provider> --json
pi --list-models | grep '<model>'
```

## Start

```bash
pi -p --mode json --model <provider>/<model> --thinking <level> '<prompt>'
```

Herdr kind: `pi`. Pass native arguments after `herdr agent start ... --`.

## Warnings

- Never omit the provider. Pi otherwise uses its configured default.
- Pi has no permission flag. Use a worktree when writes are allowed.
- Use `--no-tools` for a text-only opinion and `--no-context-files` when the
  run must ignore discovered instruction files.
- Resume with `--session <id>`.
- Attach a local image as `@file.png` only when the selected model declares
  image input.
- Provider auth and quota are separate. Save quota state per route, not per
  `pi` binary.
