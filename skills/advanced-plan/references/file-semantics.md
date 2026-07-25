# What each file means

The templates carry the structure; these are the rules for filling them
honestly. Read this before writing the plan files.

- **goal.md** — User intent, decomposed by the agent, then **locked**. Concise,
  unambiguous, observable "done means". `参考真源` names what the result must
  match and how the match is judged; leaving it blank is how a whole delivery
  gets graded on an axis nobody was measuring. Implementation choices do NOT go
  here (they drift) — they live in `spec.md`. The only post-creation edit is
  appended scope-change entries. Write it reader-first: plain language aligned to
  the goal, not the code — someone far from the code (the user) must grasp it at
  a glance; code references belong in todo.md `Verify` fields, never here.
- **spec.md** — The approach, design, and technical decisions — and where they
  get **updated** if the approach changes. Approach changed? Edit spec, never
  goal.
- **preflight.md** (conditional) — Checklist derived from spec of required
  infra/creds/services. Run the checks before coding; a preflight you don't
  execute is theater. Record what was broken + the fix.
- **todo.md** ⭐ — The **single source of truth / save-slot**. Two parts: a
  `Current State` header (the live cursor a fresh agent reads to recover) and the
  phases. Each phase needs acceptance criteria + a concrete verification method:
  - **Frontend** → verify with `agent-browser` (navigate, interact, screenshot,
    assert).
  - **Backend** → unit / smoke / E2E, named explicitly.
  - **Refactor** → existing tests green + behavior unchanged (name the command).
  - A phase is `done` only after its verification has actually run and passed —
    record the evidence (test name, screenshot path, output). Status: `todo` →
    `in_progress` → `blocked` / `done`.
- **exploration.md** — Facts about the **codebase/task**, not feelings.
  Candidates to later graduate into project knowledge (CLAUDE.md, docs). Append
  under `## [session-id]`; never rewrite history. Concurrent agents each write
  `exploration-<session-id>.md`, merged at the end.
- **review.md** — The only file about the **agent's process**, not the code.
  After the task is done, analyze the agent×user collaboration over this task's
  session-id(s) — what worked, what caused rework, what to do differently next
  time — and distill it into the template.

Boundary reminder: `exploration.md` = "what I learned about the code";
`review.md` = "what I learned about how we worked." Don't mix them.
