---
name: handoff
description: Task handoff for context transfer between sessions. Use when the user says "handoff", "交接", "save progress" to save current task state, or "take over", "pick up", "continue", "接手" to load a previous handoff by keyword. Works across any agent CLI.
argument-hint: [pick up <keyword>]
---

# Handoff Skill

Transfer context between sessions. Save a structured handoff doc so a fresh session can continue without information loss.

## Commands

### Save (handoff current task)

Trigger: user says **"handoff"**, **"交接"**, **"save progress"**

Steps:

1. Create `~/.claude/observability/handoff/` if it doesn't exist. Handoffs are records, so they live with the other agent ledgers (ccobs' DB, the dispatch ledger, the compaction log) — **never in a repo**: they survive worktree removal, pollute nothing, and one directory holds all in-flight handoffs across projects and agent CLIs.
2. Generate a short 2-4 word kebab-case title summarizing the task, and take `<project>` = last path segment of the project root.
3. Write the handoff document to: `~/.claude/observability/handoff/<YYYY-MM-DD>-<project>-<short-title>.md`
   - It's outside any repo, so background sessions can write it directly — no worktree isolation issues, no `$CLAUDE_JOB_DIR` detour.
4. The document MUST follow this structure:

```markdown
# Handoff: <descriptive title>

**Created**: <YYYY-MM-DD HH:mm>
**Project**: <project root path>

## Task Goal

What was the goal? Why was this task started? Business context and motivation.

## What Was Done

Concrete changes made. For each change:

- What file was created/modified/deleted
- What the change does
- WHY this approach was chosen over alternatives

## Current State

- What is working now
- What is NOT working or partially implemented
- Build status: does it compile? Do tests pass? Any commands to verify.

## Known Issues & Bugs

- Bugs discovered (with reproduction steps)
- Edge cases not yet handled
- Warnings or errors currently present
- Things that LOOK wrong but are intentional (explain why)

## Failed Attempts

Approaches that were tried but DIDN'T work:

- What was tried
- Why it failed
- Key takeaway (so the next session doesn't repeat it)

## Discoveries

Things learned during this session that the next session MUST internalize:

- Business logic or domain rules that aren't obvious from the code
- API behaviors, quirks, or undocumented constraints encountered
- Explicit requirements or constraints the user stated (e.g. "never use X", "must support Y")
- Patterns or conventions discovered that apply broadly to this project

## Next Steps

Prioritized list of what needs to be done next. For each item:

- What to do
- Suggested approach

## Key Files

| File         | Description          |
| ------------ | -------------------- |
| path/to/file | One-line explanation |

## Gotchas & Notes

Non-obvious things the next session MUST know:

- Tricky configs or environment requirements
- Non-obvious dependencies
- Workarounds currently in place
```

5. After writing, output:

```
Handoff saved: ~/.claude/observability/handoff/<YYYY-MM-DD>-<project>-<short-title>.md
Take over with: handoff pick up <short-title>
```

### Take Over (load a previous handoff)

Trigger: user says **"take over"**, **"pick up"**, **"continue"**, **"接手"**

Steps:

1. If no keyword provided, list the 5 most recent files matching `~/.claude/observability/handoff/*.md` — prefer those whose `<project>` segment matches the current project root's basename, fall back to all — and ask the user which one.
2. If a keyword is provided, glob `~/.claude/observability/handoff/*<keyword>*.md`.
   - Single match: use it.
   - Multiple matches: show the list and ask the user to pick.
   - No match: try the legacy locations in order — `~/tmp/handoff-*<keyword>*.md` (pre-2026-07-26), then `tmp/handoff-*<keyword>*.md` in the project root (pre-global); still nothing → show the handoff dir listing and ask for correction.
3. Read the handoff document thoroughly.
4. Print a brief summary:
   - Task goal (1-2 sentences)
   - Current state
   - Next steps to tackle
5. Ask: "Ready to continue. Start with the next steps, or adjust the plan first?"

## Critical Rules

- **Write for zero context.** The next session knows NOTHING. Write as if onboarding a new developer mid-task.
- **Include the WHY.** Decisions without reasoning are useless to the next session.
- **Never hide problems.** Document every known issue, failed approach, and workaround.
- **Failed attempts matter.** Document what didn't work to prevent repeated mistakes.
- **Keep filenames scannable.** The short title should make sense in a directory listing.
