# cursor-agent carrier

Use Cursor subscription models through `cursor-agent`. Herdr kind: `cursor`.

## Check

```bash
command -v cursor-agent
cursor-agent --list-models
```

Model names change. Confirm the exact value from `agents.json` still appears
before launch.

## Start

```bash
cursor-agent -p '<prompt>' --output-format stream-json \
  --model <model> --trust
```

Add `--force` only when edits are allowed. Use `--mode plan` or `--mode ask`
for read-only work.

## Warnings

- Use `stream-json`; `json` may not flush until exit.
- Effort is often part of the model ID. Do not change the suffix silently.
- Claude models marked `NO ZDR` must not receive sensitive code.
- Resume with `--resume <chat-id>`.
- Quota may be limited for one model while other Cursor models still work.
  Save the reset hint against the exact route.
