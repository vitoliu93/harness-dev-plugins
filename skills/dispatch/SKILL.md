---
name: dispatch
description: >-
  Outsource brief-able execution work to external headless engines —
  dscode/arkcode (claude binary on DeepSeek/Ark quota), droid, cursor-agent,
  codex, gemini — so the scarce Claude quota stays on planning and review.
  Smart model plans, cheap engine executes, you verify the diff. Use when the
  user says "dispatch", "派活", "外包", "让 deepseek/droid/cursor 做", or when a
  plan contains bulk mechanical items worth offloading.
argument-hint: "[task brief | engine name + task]"
---

# dispatch

You are the planner and reviewer; the engine is the typist. The main-session
Claude quota (5h window) is the scarcest resource in the factory — anything
that can be specified precisely should burn someone else's tokens.

## Dispatchability litmus (all three, or don't dispatch)

1. **Self-contained brief possible** — every fact fits in one prompt.
2. **No mid-task user interaction** — the engine runs unattended.
3. **Objective verification exists** — a diff, a passing test, a produced file.

Fails any → do it yourself or spawn a normal subagent.

## The brief contract (zero-context rule)

The engine starts with **zero conversation context**. Never write "fix the bug
we discussed". Every brief contains:

```
GOAL      one sentence, observable done-condition
CONTEXT   absolute file paths, exact error text, relevant code excerpts, branch name
CONSTRAINTS  what NOT to touch; style/idiom rules that matter
ACCEPTANCE   the command that must pass, or the diff shape expected
OUTPUT    where results land (worktree branch / file path / stdout)
```

## Engine routing

| Work | Engine | Why |
|---|---|---|
| Bulk implementation from a settled plan | `dscode` (fallback `arkcode`) | Same claude binary → your skills/hooks/plugins work as-is; independent quota |
| Autonomous subtask in its own branch | `droid exec --auto low -w` | Built-in worktree + autonomy levels |
| Cross-family second opinion on a diff/plan | `codex exec` | Different model family = genuinely independent eyes. But if the ask is "review/second opinion" itself, prefer the `ask-ai` skill — it manages engine choice and briefing; dispatch is for execution offload |
| Task benefiting from workspace indexing | `cursor-agent -p` | Cursor's index; `--mode plan` for read-only passes |
| Cheap long-context summarize/translate | `gemini -p` | Large context, separate quota |

Invocation templates and quirks per engine: `references/engines.md` (read the
card before first use of an engine in a session).

**Anti-pattern**: never route bulk work through bare `claude -p` — headless
shares the interactive 5h quota; the wrappers (`dscode`/`arkcode`) exist
precisely to avoid this.

## Execution pattern

1. Write the brief. For parallel edits, give each engine its own worktree
   (`git worktree add` or droid `-w`) so they can't collide.
2. Run via Bash with `run_in_background: true` — engines take minutes; don't
   block the session. Capture stdout to a file in the scratchpad.
3. **Completion = exit code + artifact, never the engine's self-report.**
   An engine saying "done, all tests pass" counts for nothing until you see
   the diff and run the acceptance command yourself.
4. Verify: `git diff` on its branch + run ACCEPTANCE. Inside a `/ship` run,
   hand the item to `ship-tester` instead.
5. Failed or half-done → tighten the brief and re-dispatch once; still bad →
   the task wasn't dispatchable, take it back inline. Don't loop a cheap
   engine on a task above its ceiling.

## Roles by tier

Plan/grill/review/verdict → main session (you). Mechanical execution →
dscode/droid. Adversarial review → codex/cursor-agent. This mirrors the
subagent model-tier rule: the node doing the actual thinking gets the capable
model; typing gets the cheap one.
