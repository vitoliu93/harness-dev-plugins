---
name: dispatch-vendors
description: >-
  Dispatch a whole self-contained task — repo recon/影响面勘察, bug repro,
  红队/独立 review, test authoring, E2E, docs, research, dependency migration
  — to a
  standalone vendor agent CLI (dscode / arkcode / kicode / cursor-agent)
  running
  unattended on its own quota, resumable by session id. Trigger when the user
  names a vendor ("让 cursor 跑/kicode 试试"), signals independence
  ("后台跑/顺便/不急/别占主线"), or you spot a parallelizable side-quest or a
  non-Anthropic model-diversity win (别的模型家族挑毛病/找盲点). NOT for the module
  the main session is actively building.
argument-hint: "[vendor + task | task brief]"
---

# dispatch-vendors

A vendor is a full standalone agent subprocess — complete tool ecosystem, real
autonomy, session-resumable, and above all **someone else's quota**. The unit
of dispatch is a WHOLE independent task with a clean boundary — never a slice
of the module being built here; that's subagent/Workflow territory.

Vendor sheets: `references/claude-variants.md` (dscode/arkcode/kicode — one
claude binary, three foreign-quota wrappers) · `references/cursor-agent.md`.
Scenario catalog
with brief shapes and vendor picks: `references/scenarios.md`. Onboarding a
NEW vendor (or re-probing one): the ten-rung ladder in
`references/vendor-onboarding.md` — also holds the live CLI×model capability
matrix (vision, output caps, banned endpoints); **image-bearing tasks route
to vision-capable cells (cursor composer/grok, kicode k3 — deepseek/glm are
text-only), or to a text-only cell with the media-understanding fallback
written into the brief** (variants sheet has the exact pattern).

## Gate — dispatch only if at least ONE pays

- **D**iversity: the value IS a non-Anthropic model's eyes — independent
  review, red-team, second-opinion implementation. A subagent structurally
  cannot provide this.
- **Q**uota: heavy/long unattended work (test suite, migration pilot, E2E,
  flaky hunt, benchmark, overnight run) that would eat the 5h window.
- **I**ndex: cursor-agent's workspace index beats cold grep — repo recon,
  bug localization. Use `--mode plan` (read-only) for these.

Plus the boundary litmus, all three: brief fits in one prompt · zero mid-task
interaction · verifying the result is much cheaper than re-deriving it.

## Don't dispatch — route elsewhere

- Result blocks your very next step → it's the main line, do it inline.
- Needs this session's accumulated context (brief would paste >~200 lines of
  prior decisions) → subagent.
- More-Claude-eyes on a diff → `/code-review`; stronger-reasoning second
  opinion → second-opinion; web research fan-out → deep-research; deterministic
  multi-agent orchestration → Workflow. Vendor wins only on D/Q/I.
- User wants to watch or steer → keep it inline (or they bare-open the CLI).

## Protocol

1. Brief is zero-context (every fact inline) + a machine-checkable acceptance
   command written BEFORE dispatching. Parallel edits → vendor gets its own
   worktree. Long/review-class briefs must also demand the deliverable file
   created EARLY (skeleton first, fill incrementally) — a killed/timed-out
   vendor then still leaves partial value on disk (verified: a 560s kill
   with nothing written; cursor 20-min hang with the report unflushed).
2. Launch with Bash `run_in_background: true`, using the vendor sheet's exact
   incantation — dscode/arkcode/kicode are `~/.zshrc` functions, wrap in
   `zsh -ic '…'` and pass `--model` explicitly; cursor-agent takes
   `source ~/.zshenv &&` for keys.
   Use `stream-json` (variants add `--verbose`; cursor's `json` can hang
   unflushed). stdout to scratchpad, stderr separate (never `2>&1` — merging
   mangles the JSON). Capture the **session id at launch** from line 1's
   `init` event (cursor: chatId) — it survives a kill, a buffered `json`
   run's does not. Inspect the file only via `wc -l` / `tail -N | jq -c`;
   never `cat`/`head`/Read it whole, and never poll on a timer — the redirect
   only keeps megabytes out of context if you don't pull them back in.
3. Verify yourself — run the acceptance, read the artifact; never accept the
   vendor's self-report. Fix round = resume by session id with one
   consolidated list. Two resumes max, then take it back inline.
4. Append `date | vendor | scenario | pass/fail(+fixups) | resumes:N` to
   `~/.claude/dispatch/ledger.md` (debrief reads it at 收盘).
