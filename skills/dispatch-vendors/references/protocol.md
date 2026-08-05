# Execution protocol — after the gate says yes

Read this once you have decided to dispatch. The gate lives in SKILL.md; this
is brief → probe → launch → verify → ledger, plus recovery when a vendor gets
quota-limited mid-run.

## 1. Brief

Zero-context (every fact inline) + a machine-checkable acceptance command
written BEFORE dispatching. The brief must state the acceptance script is
read-only for the vendor — threshold mismatch → report NEEDS_CONTEXT, never
edit the gate (a vendor once rewrote the threshold; DONE self-reports are void
once the gate is editable). Parallel edits → vendor gets its own worktree.
Long/review-class briefs: demand deliverable file created early (skeleton first).

Three things zero-context does NOT mean prose:

- **Source artifacts go over verbatim, by path.** Design source, prototype,
  schema dump, sample payload — write the in-repo path into the brief and
  require the vendor to read it first. Your prose retelling is not the artifact
  and does not satisfy zero-context. External file (host Downloads/Desktop or `${DOWNLOADS_DIR}`) →
  copy it into the repo first; a vendor subprocess cannot see what isn't in
  the tree.
- **Constants carry provenance.** Any threshold / conversion factor / contract
  number you hand down cites its `file:line`, and you re-source it yourself
  once. A vendor's own passing test proves it implemented your brief — never
  that your brief was right.
- **Recon output sets direction, not truth.** For guard/security/invariant
  work, re-derive the write paths yourself (grep every call site) before coding
  against a recon conclusion.

The vendor does **not** commit — changes stay in the working tree, you verify,
then you commit. (Otherwise the diff lands under your git identity before
anyone reviewed it.)

## 2. Probe, then launch

**Probe before you bet the brief** (30s, first dispatch into a repo/worktree
this session): one throwaway run — "read `<known file>` and echo its first
line". No output → the vendor's tools are dead in that tree; go inline instead
of discovering it 14 minutes later (real case: a full recon brief came back as
"all filesystem tools failed, cannot deliver").

Launch with Bash `run_in_background: true`, using the vendor sheet's exact
incantation — dscode/arkcode/kicode are `~/.zshrc` functions, wrap in
`zsh -ic '…'` and pass `--model` explicitly; cursor-agent takes
`source ~/.zshenv &&` for keys.

Use `stream-json` (variants add `--verbose`; cursor's `json` can hang
unflushed). stdout to scratchpad, stderr separate (never `2>&1` — merging
mangles the JSON). Capture the **session id at launch** from line 1's `init`
event (cursor: chatId) — it survives a kill, a buffered `json` run's does not.
Inspect the file only via `wc -l` / `tail -N | jq -c`; never `cat`/`head`/Read
it whole, and never poll on a timer — the redirect only keeps megabytes out of
context if you don't pull them back in.

**Index scenarios (`--mode plan`, read-only):** plan mode also blocks writes to
your scratchpad, so the report never lands. Either drop `--mode plan` and put
"read-only, change no file in the repo" in the brief, or
`--resume <session> -p 'write the report to <path>'` after.

## 3. Verify

Run the acceptance yourself, read the artifact; never accept the vendor's
self-report. Fix round = resume by session id with one consolidated list. Two
resumes max, then take it back inline.

## 4. Ledger

Append to `~/.claude/observability/dispatch/ledger.md` — records live with the
other agent ledgers, never in a repo (debrief reads it at 收盘):

```
date | vendor | scenario | why:econ|obs|advice | pass/fail(+fixups) | resumes:N
```

**Write the row in the same Bash call that launches** (`… | dispatched`), then
amend the verdict on return — rows recorded only on success go missing exactly
when they matter. A fixup caused by *your* wrong brief is logged as such, not
as a vendor fixup; the ledger is a signal about the gate, not a scoreboard.

**`why:` field rules**

- Tag every row: `why:econ` (economics floor) or `why:obs` (collaboration validation).
- `econ` rows judge pass/fixup against the token floor; `obs` rows judge whether non-Anthropic collaboration adds signal a subagent would not.
- Deliberate under-floor batches must stay tagged `obs` — unmarked rows skew econ stats.
- Do not use "token 没省下来" alone to veto `obs` dispatches; that measures a different question.

## Recovery — vendor limited mid-run

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
partial report verbatim and listing what's already excluded/confirmed, so the
successor doesn't re-derive it. Takeover also dies → inline.

Ledger the limited run as `fail(quota-limited)` so debrief sees the pattern.
