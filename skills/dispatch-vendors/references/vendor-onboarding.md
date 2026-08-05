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

## Capability matrix (current fleet)

Status: **supported** · **unsupported** · **unknown**. Vision: **yes** · **no** · **fallback-only** · **fatal-if-direct**.

| CLI × model | write path | vision | output | role / limits |
|---|---|---|---|---|
| kicode × k3[1m] | supported | yes | stream-json per event | D+Q; 1M ctx; permission via settings auto |
| dscode × deepseek-v4-flash | supported | fallback-only | json exit-flush; stream-json available | bulk codegen/tests; text-only |
| arkcode × glm-5.2[1m] | supported | fatal-if-direct | same as dscode | backup when dscode limited; no images in brief |
| cursor × composer-2.5 | supported | yes | use stream-json/text, not json | fast/light + vision |
| cursor × grok-4.5-high | supported | yes | stream-json; plan deliverable in tool event | hard Q / red-team tier |
| cursor × gpt-5.6-sol-high | unknown | yes (docs) | same as cursor | hard tier; confirm before relying |
| kimi-code × k3[1m] | supported | yes | stream-json; stdout block-buffered until exit | primary k3 carrier |
| grok CLI × grok-4.5 | unknown | unknown | streaming-json | spare carrier; complete ladder before dispatch |

**Image fallback (media-understanding)**: text-only carriers — brief must run script first:

```bash
MEDIA_SKILL_DIR=${CLAUDE_SKILL_DIR}   # after loading media-understanding skill
"$MEDIA_SKILL_DIR/scripts/gemini_media.py" <file> [--audio-only] [--question "Q"]
```

**Cursor tier rule**: composer-2.5 for fast/light + vision; grok-4.5-high for hard/red-team; gpt-5.6-sol-high when listed and confirmed.
