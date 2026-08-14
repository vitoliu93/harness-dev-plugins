# Execution protocol — after the gate says yes

Read this once you have decided to dispatch. The gate lives in SKILL.md; this
is brief → probe → launch → verify → ledger, plus recovery when a vendor gets
quota-limited mid-run.

## 1. Brief

Zero-context means every required fact is inline. Apply these gates:

- Write a machine-checkable acceptance command before dispatching.
- Mark the acceptance script read-only for the vendor.
- On threshold mismatch, require `NEEDS_CONTEXT`; never allow a gate edit.
- Verification briefs: require `SKIPPED` + reason for an unrunnable case and
  `NEEDS_CONTEXT` when blocked; reject a guessed pass.
- Reject a `DONE` self-report when the vendor changed the gate.
- Give parallel edits their own worktree.
- For long or review-class briefs, require an early deliverable skeleton.
- Before a sensitive dispatch, enumerate the inherited surface: the vendor
  auto-discovers host agent config (instruction files, plugin skills) and
  inherits your MCP/credential reach — the brief is not its whole instruction
  set, and its privilege is yours.

Three things zero-context does NOT mean prose:

- **Source artifacts go over verbatim, by path.** Design source, prototype,
  schema dump, sample payload — write the in-repo path into the brief and
  require the vendor to read it first. Your prose retelling is not the artifact
  and does not satisfy zero-context. External file (host Downloads/Desktop or `${DOWNLOADS_DIR}`) →
  copy it into the repo first; a vendor subprocess cannot see what isn't in
  the tree.
- **Constants carry provenance.** Any threshold / conversion factor / contract
  number you hand down cites its `file:line`, and you re-source it yourself
  once. Treat a vendor's passing test as implementation evidence, not proof
  that the brief is correct.
- **Recon output sets direction, not truth.** For guard/security/invariant
  work, re-derive the write paths yourself (grep every call site) before coding
  against a recon conclusion.

The vendor does **not** commit — changes stay in the working tree, you verify,
then you commit. (Otherwise the diff lands under your git identity before
anyone reviewed it.)

## 2. Probe, then launch

**Probe before launch** (30s, first dispatch into a repo/worktree this
session): run "read `<known file>` and echo its first line". No output means
the vendor tools are unavailable in that tree; go inline.

Launch with Bash `run_in_background: true`, using the vendor sheet's exact
incantation — dscode/arkcode/kicode are `~/.zshrc` functions, wrap in
`zsh -ic '…'` and pass `--model` explicitly; cursor-agent takes
`source ~/.zshenv &&` for keys.

- Use `stream-json` (variants add `--verbose`; cursor's `json` can hang unflushed).
- Redirect stdout to the scratchpad; keep stderr separate — never `2>&1`, merging mangles the JSON.
- Capture the **session id at launch** from line 1's `init` event (cursor: chatId); it survives a kill, a buffered `json` run's does not.
- Inspect the file only via `wc -l` / `tail -N | jq -c`; never `cat`/`head`/Read it whole, and never poll on a timer — the redirect only keeps megabytes out of context if you don't pull them back in.

**Launch is the fragile moment.** A probe that passed earlier does not prove
launch-time health (TLS interception, gateway resets). No `init` line within
~15s of launch → read the stderr file, relaunch with backoff. Mid-stream drops
usually self-heal via carrier reconnect; a missing first line never does.

**Index scenarios (`--mode plan`, read-only):** plan mode also blocks writes to
your scratchpad, so the report never lands. Either drop `--mode plan` and put
"read-only, change no file in the repo" in the brief, or
`--resume <session> -p 'write the report to <path>'` after.

## 3. Verify

- Run the acceptance yourself, read the artifact; never accept the vendor's self-report.
- Fix round = resume by session id with one consolidated list.
- Two resumes max, then take it back inline.

Harvest the final report from the deliverable artifact or the whole `result`
event — a byte-capped stdout slice can silently drop acceptance evidence from
a complete report. Require acceptance outputs in the deliverable's result
slots, not stdout only.

Relay every vendor caveat — SKIPPED cases, degraded checks, side-effect
observations — into your own report, or drop it with a stated reason. A caveat
absorbed in retelling is evidence lost.

## 4. Ledger

Append to `~/.claude/observability/dispatch/ledger.md` — records live with the
other agent ledgers, never in a repo (debrief reads it at 收盘):

```
date | vendor | scenario | why:econ|obs|advice | pass/fail(+fixups) | resumes:N
```

- **Write the row in the same Bash call that launches** (`… | dispatched`), then amend the verdict on return.
- Log a fixup caused by the host brief as a host fixup, not a vendor fixup.
- Use the ledger to evaluate the dispatch gate.

**`why:` field rules**

- Tag every row: `why:econ` (economics floor) or `why:obs` (collaboration validation).
- `econ` rows judge pass/fixup against the token floor; `obs` rows judge whether non-Anthropic collaboration adds signal a subagent would not.
- Deliberate under-floor batches must stay tagged `obs` — unmarked rows skew econ stats.
- Judge `obs` rows by whether non-Anthropic collaboration adds signal; token savings do not decide `obs` rows.

## Recovery — vendor limited mid-run

Diagnose before acting:

- A stall is not proof — process alive + session jsonl still advancing = still working, leave it alone.
- Confirmed limit = 429/quota errors in the jsonl tail, or the user says so from the vendor console.
- Window sizes and reset times are console-side facts you cannot see — never guess them.
- wait-for-reset is only an option when the user explicitly offers it.

Once limited, **hand over**:

- Retain the session id for a later resume; use the partial work already on disk.
- Kill the run, harvest the worktree + report.
- Re-dispatch to a DIFFERENT vendor family, or take it inline.
- Takeover brief = original brief + `## Prior findings (from a limited run)`,
  pasting the partial report verbatim and listing what's already
  excluded/confirmed, so the successor doesn't re-derive it.
- Takeover also dies → inline.

Ledger the limited run as `fail(quota-limited)` so debrief sees the pattern.
