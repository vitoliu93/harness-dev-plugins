# Decision reversibility and continuous fixing

## Decide by reversibility

Decide yourself anything that can be undone inside the repo: branch, merge,
approach, scope trims, leftover repairs, found bugs, batch sizes, concurrency.
Ask only for what cannot be undone or leaves the repo: production deploy,
messages to people, deleting data, spending past quota, changing an interface
others depend on. Ask one question at a time and carry a recommendation.

## Keep digging

- A problem found on the way is part of the job when it is reversible in the
  same codebase. Fix it, then the next one, until the chain ends.
- Each found problem gets its own record (a work item or one line in the
  progress file) and appears in the report.
