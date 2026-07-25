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
**Default pick (2026-07-22 quota economics): cursor-agent +
`cursor-grok-4.5-high`** (composer-2.5 serves as its subagent model —
Cursor delegates internally, hands-off) — Ultra quota is huge and mostly
unspent; kicode's Kimi quota is small, reserve it for diversity-core or true
1M-ctx loads. Sub-1M ctx is covered by auto-compaction for long runs (keep
observing at scale via the ledger).
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
  bug localization. Use `--mode plan` (read-only) for these — **but plan mode
  also blocks writes to your scratchpad, so the report never lands; either drop
  `--mode plan` and put "read-only, change no file in the repo" in the brief,
  or `--resume <session> -p 'write the report to <path>'` after.**

**Q has a floor.** The vendor must plausibly run **≥20 min** or produce
**≥300 lines**. Below that, writing the brief + verifying the result costs more
than the generation it saves — measured: a batch of 5–8 minute UI-component
dispatches was net-negative. Under the floor → inline or subagent.

**A — acceptance-decidable, a veto (not a reason to dispatch).** Dispatch only
if "did it work" is answerable by a command. When success is judged by *does it
look right* (visual fidelity, layout, wording, feel), the vendor gets only the
machine-checkable subset (data contracts, pure functions, state machines); the
look-and-feel part stays inline. Legitimate middle path: dispatch a
**spec-extraction** run first (design source → verbatim spec table), you approve
the spec, and only then dispatch implementation against it.

Plus the boundary litmus, all four: brief fits in one prompt · zero mid-task
interaction · verifying the result is much cheaper than re-deriving it **and
the verification is not your eyes** · the brief is shorter than the code you'd
write doing it yourself.

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
   command written BEFORE dispatching. The brief must state the acceptance
   script is read-only for the vendor — threshold mismatch → report
   NEEDS_CONTEXT, never edit the gate (a vendor once rewrote the threshold;
   DONE self-reports are void once the gate is editable). Parallel edits →
   vendor gets its own worktree. Long/review-class briefs must also demand the deliverable file
   created EARLY (skeleton first, fill incrementally) — a killed/timed-out
   vendor then still leaves partial value on disk (verified: a 560s kill
   with nothing written; cursor 20-min hang with the report unflushed).
   Three things zero-context does NOT mean prose:
   - **Source artifacts go over verbatim, by path.** Design source, prototype,
     schema dump, sample payload — write the in-repo path into the brief and
     require the vendor to read it first. Your prose retelling is not the
     artifact and does not satisfy zero-context. External file (`~/Downloads`,
     Desktop) → copy it into the repo first; a vendor subprocess cannot see
     what isn't in the tree.
   - **Constants carry provenance.** Any threshold / conversion factor /
     contract number you hand down cites its `file:line`, and you re-source it
     yourself once. A vendor's own passing test proves it implemented your
     brief — never that your brief was right.
   - **Recon output sets direction, not truth.** For guard/security/invariant
     work, re-derive the write paths yourself (grep every call site) before
     coding against a recon conclusion.
   The vendor does **not** commit — changes stay in the working tree, you
   verify, then you commit. (Otherwise the diff lands under your git identity
   before anyone reviewed it.)
2. **Probe before you bet the brief** (30s, first dispatch into a repo/worktree
   this session): one throwaway run — "read `<known file>` and echo its first
   line". No output → the vendor's tools are dead in that tree; go inline
   instead of discovering it 14 minutes later (real case: a full recon brief
   came back as "all filesystem tools failed, cannot deliver").
   Launch with Bash `run_in_background: true`, using the vendor sheet's exact
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
   `~/.claude/dispatch/ledger.md` (debrief reads it at 收盘). **Write the row
   in the same Bash call that launches** (`… | dispatched`), then amend the
   verdict on return — rows recorded only on success go missing exactly when
   they matter. A fixup caused by *your* wrong brief is logged as such, not as
   a vendor fixup; the ledger is a signal about the gate, not a scoreboard.

## Vendor limited mid-run (quota/rate-limit hits while the job is going)

Diagnose before acting — a stall is not proof: process alive + session jsonl
still advancing = still working, leave it alone. Confirmed limit = 429/quota
errors in the jsonl tail, or the user says so from the vendor console (window
sizes and reset times are console-side facts you cannot see — never guess
them; wait-for-reset is only an option when the user explicitly offers it).

Once limited, **hand over — it's cheap by construction**: the session id is
stored (resumable later if quota returns) and partial work is already on disk
(early-skeleton rule). Kill the run, harvest the worktree + partial report,
then re-dispatch to a DIFFERENT vendor family or take it inline — takeover
brief = original brief + `## Prior findings (from a limited run)` pasting the
partial report verbatim and listing what's already excluded/verified, so the
successor doesn't re-derive it. Takeover also dies → inline.

Ledger the limited run as `fail(quota-limited)` so debrief sees the pattern.
