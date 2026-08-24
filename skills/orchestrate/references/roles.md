# Role catalog

Use the fewest roles that cover the work.

| Role | Job | Output | Must not do |
|---|---|---|---|
| `host` | Split work, pass context, run checks, decide | Task graph and final result | Hand away final responsibility |
| `advisor` | Test a difficult decision or plan | Short verdict, risks, next action | Routine editing |
| `researcher` | Find code or external facts | Evidence with paths or links | Change implementation |
| `programmer` | Build one bounded change | Diff or artifact plus check result | Expand scope without asking |
| `audit` | Check another role's output | PASS/FAIL with evidence | Quietly repair the work it audits |

The shapes follow a simple pattern used by Amp: Oracle supplies a strong second
opinion, Librarian gathers remote code facts, ordinary subagents do isolated
work, and focused reviewer agents inspect a narrow result.

If several programmers are needed, create role instances such as
`programmer-api` and `programmer-ui`. Each instance gets its own card and tab.
