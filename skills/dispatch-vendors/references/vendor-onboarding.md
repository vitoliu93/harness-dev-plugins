# Vendor onboarding — ten-rung ladder

Order rungs by increasing cost:

- Do not advance until the current rung passes.
- Record pass criteria and failure modes per CLI×model.

## Ladder

### ① Form (free)
`type <cli>` + `command -v` — binary or shell function? Which rc file?
- Pass: know whether `zsh -ic` wrapper is required.
- Fail mode: function called without `zsh -ic` → exit 127; trace key injection path (`~/.zshenv`, wrapper env).

### ② Text probe (pennies)
`<cli> … "reply with exactly: ok" …` with json output flag, no tools.
- Pass: get ok + know where session id appears + stdout/stderr stay separate.
- Fail mode: default model slot not remapped → backend 400.

### ③ Permission flags (pennies)
Minimal read-file task; find unattended flags.
- Pass: vendor actually reads the file.
- Fail mode: silent empty success (0 tokens, exit 0) — always inspect output.

### ④ Resume (pennies)
Second message on probe session.
- Pass: same id, remembers context.
- Fail mode: resume on zero-output session often no-ops again.

### ⑤ Liveness backdoor (free)
Locate session on disk; distinguish hung vs done-but-unflushed.
- Pass: can use mtime/size; know how to harvest with resume.

### ⑥ Write path (cheap)
Own git worktree; small real write task + machine acceptance you run.
- Pass: acceptance green; `git status` clean except target files.
- Fail mode: native `-w` headless may hang before conversation — use manual worktree.

### ⑦ Modality matrix (cheap)
PNG with text + graphics; record supported / graceful-degrade / fatal.

### ⑧ Output behavior (cheap)
Long output task: json exit-flush vs stream flush; per-turn cap if any.

### ⑨ Per-model verdict
- Treat CLI×model as the unit.
- Record separate verdicts for different models on the same CLI.
- Build failover chains at CLI×model granularity.

### ⑩ Register
- Add `references/<cli>.md`.
- Add a scenarios row and start the ledger habit.
- Run one month of real use before treating the pair as stable.

## Capability matrix — record in the manifest, not in this doc

Verdicts per CLI×model are machine-local. Record the fleet in the vendor
manifest (`status` + `note` per slot; schema:
[vendor-manifest.schema.md](vendor-manifest.schema.md)), never in this doc.
Status: **supported** · **unsupported** · **unknown** · **quota-exhausted**
(pool wall, not a capability verdict — record the reset date). Vision:
**yes** · **no** · **fallback-only** · **fatal-if-direct**.

**Image fallback (media-understanding)**: text-only carriers — brief must run script first:

```bash
MEDIA_SKILL_DIR=${CLAUDE_SKILL_DIR}   # after loading media-understanding skill
"$MEDIA_SKILL_DIR/scripts/gemini_media.py" <file> [--audio-only] [--question "Q"]
```

Which models fill `advisor` and `executor` is the machine's choice —
`vendor-manifest.example.json` shows the shape. A new model enters as
`executor` unless it is top-tier; `advisor` stays narrow.
