# Role catalog

Use the fewest roles that cover the work.

| Role | Job | Output | Must not do |
|---|---|---|---|
| `host` | Split work, pass context, run checks, decide | Task graph and final result | Hand away final responsibility |
| `advisor` | Test a difficult decision or plan | Short verdict, risks, next action | Routine editing |
| `researcher` | Find code or external facts | Evidence with paths or links | Change implementation |
| `programmer` | Build one bounded change | Diff or artifact plus check result | Expand scope without asking |
| `tester` | Design and run tests for one change from the requirement and the diff alone | PASS/FAIL with the commands it ran and their output | Read the producer's reasoning; accept the producer's own report as evidence; repair the change |
| `audit` | Independent read-only final acceptance: rerun the completion checks on the finished work | PASS/FAIL with the commands it ran and their output | Write anything; quietly repair the work it audits; accept any earlier PASS as evidence |

The shapes follow a simple pattern used by Amp: Oracle supplies a strong second
opinion, Librarian gathers remote code facts, ordinary subagents do isolated
work, and focused reviewer agents inspect a narrow result.

`tester` and `audit` stay separate. The tester finds and runs tests while the
change is fresh; the audit judges the finished work at the end and reruns checks
itself. Neither replaces the other.

If several programmers are needed, create role instances such as
`programmer-api` and `programmer-ui`. Each instance gets its own card and tab.
