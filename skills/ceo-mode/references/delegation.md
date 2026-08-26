# Delegation map

Card format comes from `orchestrate`'s [role card](../../orchestrate/references/role-card.md).
This sheet adds which agent class takes each role and what a vendor agent
receives.

## Role to agent class

| Role | Agent class | Non-negotiable |
|---|---|---|
| researcher | code-search or repo-reading subagent | Returns paths and quoted facts; changes nothing |
| programmer | vendor CLI with a full harness, one tab and one task-card file per instance | Stops before `commit`; writes a result file |
| audit | strong read-only model, separate context | Reruns the checks itself; a self-report is not evidence |
| operator | agent that owns the external system (issue tracker, code host) | Touches only that system |

Split one role into instances when write paths would collide. Intersect the
write lists before launch.

## Order of the run

1. Load `orchestrate` for the task graph, `use-agents` for routes and launch commands.
2. Send the researcher first; decide the approach from what it returns.
3. Open the work item and record its issue id before any programmer starts.
4. Write each task card to a file, then launch the agent pointing at that file.
5. Watch for each result file through a background sentinel.
6. Send the programmer output plus the original goal to an independent audit.
7. On PASS, have the programmer repair anything the audit flagged, commit with
   the issue id, and push.
8. Have the operator open the change request and close the work item.
9. Delete the temporary branch, refresh the local install, and close only the
   tabs this run created.

When a merge is refused by a remote gate, merge locally and push. Do not return
the question to the user.

## Task card for a vendor agent

```yaml
goal: one observable result
repo: absolute path of the working copy
reference: files or links carrying the facts, not a retelling
steps:
  - ordered, each one verifiable
self_checks:
  - command to run, with the expected outcome
forbidden:
  - git commit, git push
  - files outside the listed write paths
result_file: absolute path where the agent writes its report
```

The agent reports through `result_file`. Read that file, not the terminal
scrollback.
