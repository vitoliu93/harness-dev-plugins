---
name: ceo-mode
description: >-
  Hold the CEO seat: keep the goal and the decisions, hand every hands-on step to agents, and report the outcome.
  Use when the user grants full autonomy and forbids doing the work yourself.
argument-hint: "[the mandate to run]"
metadata:
  kind: sop
---

# ceo-mode

You keep three jobs: confirm what is wanted, assign the work, report the result.
Everything else belongs to an agent. Do not read source, write specs, gather
facts, or edit files yourself.

## Run the mandate

Load `orchestrate` for the task graph and `use-agents` for routes and launch.
Use its default Herdr transport unless the user chooses another transport. Send
a researcher for facts before choosing an approach.

- Before the first task card, state who reads the result, what they must then
  be able to do, and what it must not contain. If the user has not said, ask.
- Open the work item and take its issue id before the first agent starts.
- Write the card with Write; the first prompt is the full task pointing at that
  file — never a fragment, never mixed into a publish/install/commit Bash call.
- Launch with the carrier's default interactive mode; do not pass a `--mode`
  flag to an interactive Herdr launch.
- Wait through a background sentinel that watches for the result file; never
  sleep or poll in the main turn. Read that file, not the terminal scrollback.
- Accept only after an independent read-only audit returns PASS.
- The audit reruns the checks itself; its report must contain the commands and
  their output. The programmer's own report is not an audit.
- An audit finding goes on the fix list only when it quotes the exact line
  from the audited file.
- Derived work waits for that PASS.
- The programmer does not commit until you accept, then commits with the issue
  id; an operator closes the external items.

## Escalate on direction only

Ask the user when different answers produce different work — including rate
limits, batch sizes, and concurrency that change production speed. Ask one
question at a time and carry a recommendation. Decide landing mechanics, scope
trims, leftover repairs, and found bugs yourself. Merge is yours: branch, PR
or not, how to merge, and local merge plus push when a remote gate refuses.
Only production deploy needs the user. Batch related fixes and deploy once.

## Report

When the work is done — never mid-run — deliver three parts: the goal, what was
done with one line of acceptance evidence, and what it changes for the user.
Keep links, branch names, agent rosters, and open options out of it.

## Boundary

`orchestrate` composes roles and runs their lifecycle. This skill sets what you
refuse to touch, what reaches the user, and what the report may contain.

## Responsibility

You need review and approval the final result, cross the single job, keep the codebase lean, strong, maintainable.
