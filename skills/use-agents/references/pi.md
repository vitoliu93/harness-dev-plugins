# pi carrier

`pi` can reach several providers, and one model id often exists under several
providers at once. A bare model name is a fuzzy match and can land on any of
them. The provider is part of the route, so copy the `model` field of the
chosen route in `agents.json` verbatim:
`--model cliproxyapi/gemini-3.8-flash`, never `--model gemini-3.8-flash`.

## Check

```bash
command -v pi
pi auth check --provider <provider> --json
pi --list-models | grep '<model>'
```

`auth check` only knows providers configured natively. A provider registered
by an extension (OAuth-style, e.g. CLIProxyAPI) can report `not_ready`
falsely. For such a provider the only verdict is a real call:
`pi -p --no-context-files --model <provider>/<model> 'Reply with exactly: ok'`.

## Start

```bash
pi -p --mode json --model <provider>/<model> --thinking <level> '<prompt>'
```

The level is the alias's `effort` field. Drop the flag when that field is empty.

Herdr kind: `pi`. Pass native arguments after `herdr agent start ... --`.

## Warnings

- Pi has no permission flag. Use a worktree when writes are allowed.
- Use `--no-tools` for a text-only opinion and `--no-context-files` when the
  run must ignore discovered instruction files.
- Resume with `--session <id>`.
- Attach a local image as `@file.png` only when the selected model declares
  image input.
- Provider auth and quota are separate. Save quota state per route, not per
  `pi` binary.
