---
name: ask-codex
description: >-
  Consult OpenAI's Codex CLI for a second opinion on tough engineering problems.
  Use when stuck after 2+ failed attempts, facing an unexplained bug, or when the
  user says "ask codex/gpt/openai" or "get a second opinion". Not for simple
  lookups — use find-docs or WebSearch.
---

# Ask Codex

A skill for escalating tough problems to OpenAI's Codex CLI (`codex`) for a second opinion, typically using GPT-5.5.

## Why this exists

You (Claude) are powerful, but every model has blind spots. When you've cycled through multiple hypotheses and can't figure out what's happening, a fresh reasoning pass from a different model family often breaks the deadlock in one shot. Vito taught me this the hard way during a dagre/Next.js bundling bug (2026-04-24): Node.js repro disagreed with browser output using the same library version, and I had burned a lot of turns on wrong theories. One call to `codex --model 'gpt-5.5' exec` diagnosed it immediately (shared object-reference mutation in `setNode`'s label argument).

Cost is cheap relative to the value of unblocking. Use it.

## When to trigger

Reach for codex when **any** of these are true:

- You've tried 2+ distinct hypotheses and none explain the observed behavior.
- You have a contradiction you can't reconcile (e.g., "my repro works but the real app doesn't", "the docs say X but I see Y", "same inputs, different outputs").
- The user explicitly asks for a second opinion / to ask gpt / to ask openai / to ask codex.
- You're about to hand-wave or guess on a hard question that will actually ship to production.
- A bug crosses environments (local vs. CI, dev vs. prod, Node vs. browser, different bundlers/runtimes) and you can't localize it.

**Do not** trigger for:

- Simple doc lookups — use `find-docs` or WebSearch.
- Quick syntax questions — you can solve those yourself.
- Anything the user wants you specifically to reason about.

## How to call it

Always invoke via the Bash tool, non-interactively. **Do NOT rely on codex's stdout** — Bash background mode swallows it, and it's full of banner/token-count noise anyway. Capture the answer with `--output-last-message` and Read the file.

### Basic shape

```bash
ans=$(mktemp -t codex_answer.XXXXXX)
codex --model 'gpt-5.5' -c model_reasoning_effort="xhigh" exec --output-last-message "$ans" "<self-contained prompt>"
# then Read "$ans"
```

`mktemp` guarantees a globally unique path — safe even when multiple Claude sessions run concurrent codex calls. `--output-last-message` writes only the final answer, no noise. `-c model_reasoning_effort="xhigh"` forces maximum reasoning depth — worth the extra latency since we only reach for codex on hard problems.

### Long prompts — stdin from a file

Heredoc-as-argument (`exec "$(cat <<EOF ... EOF)"`) is fragile: in bg mode codex sometimes silently exits without sending the prompt. Write the prompt to a file and pipe via stdin instead:

```bash
# 1. Write the prompt with the Write tool to e.g. /tmp/codex_prompt_$$.txt
# 2. Then:
ans=$(mktemp -t codex_answer.XXXXXX)
codex --model 'gpt-5.5' -c model_reasoning_effort="xhigh" exec --output-last-message "$ans" - < /tmp/codex_prompt_$$.txt
# 3. Read "$ans"
```

Trailing `-` tells codex to read the prompt from stdin.

### Other useful flags (see `codex exec --help`)

- `-C <dir>` — set working directory if codex needs repo context.
- `--skip-git-repo-check` — allow running outside a git repo. Must appear AFTER `exec`, not before.
- `-i <image>` — attach an image (e.g., a screenshot of a failing render).
- `--json` — stream events as JSONL if you want to parse output programmatically.
- `--search` — enable live web search. Usually not needed; codex will search on its own when relevant.

## Concurrency

Codex CLI talks to a single shared `Codex.app` `app-server` daemon. Measured behavior (2026-04-27): **~2 concurrent calls run in parallel; the 3rd queues silently** behind them. No error, no warning — just longer wall time (e.g. 3 calls of ~11s each → first two finish at 11s, third finishes at 21s).

If you need many parallel calls, batch in groups of ≤2.

## Failure recovery — codex hung or 0-byte answer

**Symptoms of a stuck `app-server`:**

- codex process running > 2 min with `ps -o time` showing CPU time ≈ 0
- `lsof -p <codex_pid>` shows no `ESTAB` network connections (codex hasn't even sent the API request)
- codex holds a lock under `~/.codex/tmp/arg0/codex-arg0*/.lock`

**Recovery:**

```bash
# 1. Kill the stuck CLI
pgrep -f "codex --model" | xargs kill

# 2. If hangs persist across retries, the long-running app-server itself is likely wedged.
#    Check its uptime first:
ps -o pid,etime,command -p $(pgrep -f "Codex.app.*app-server" | head -1)
#    If etime is many hours/days AND CLI keeps hanging, kill it:
pgrep -f "Codex.app.*app-server" | xargs kill
#    It will be relaunched on the next codex CLI invocation.

# 3. Retry.
```

**If `--output-last-message` file is empty but codex exited cleanly:** the prompt likely never reached the API. Check `~/.codex/sessions/$(date +%Y/%m/%d)/` — if no fresh `rollout-*.jsonl` was created, switch to the stdin-from-file pattern above.

## Writing a good prompt to codex

Codex arrives cold — no context from this conversation. Treat it like briefing a senior colleague who just walked into the room. The quality of your prompt determines the quality of its answer.

### Required sections

1. **One-line framing** — what kind of problem this is (bug, design question, numerics issue, etc.).
2. **Inputs** — the exact inputs, code, config, versions involved. Paste the minimum viable code to reproduce.
3. **Expected vs. actual** — what you expected to see, what you actually see. Be specific with numbers, line numbers, transforms, whatever is observable.
4. **Things ruled out** — list the hypotheses you've already checked and confirmed wrong. This keeps codex from wasting effort re-exploring dead ends.
5. **Length cap** — always cap the response (e.g., "Answer in under 200 words."). Codex defaults to verbose.

### Example prompt (the dagre bug that worked)

```
I have a puzzling bug with dagre graph layout. Same dagre@0.8.5, same
exact input, different outputs between Node.js and browser (Next.js 15
Turbopack bundle).

Input (5 nodes, 4 edges):
- nodes: brief (260x132), scriptA (300x186), workA (260x220),
  scriptB (300x186), workB (260x220) — all unique IDs
- edges: brief→scriptA, scriptA→workA, brief→scriptB, scriptB→workB
- config: { rankdir: 'LR', ranksep: 120, nodesep: 46, marginx: 64, marginy: 58 }

Code (simplified):
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph(DAGRE_CONFIG)
    for (const n of nodes) g.setNode(n.id, { width, height })
    for (const e of edges) g.setEdge(e.source, e.target)
    dagre.layout(g)

Node.js output (correct):
- scriptA (594, 168), scriptB (594, 434)

Browser output (WRONG):
- scriptA and scriptB both at (594, 434) — siblings collapse

Things I verified:
- All 5 node IDs are unique (confirmed in DOM data-id).
- All 4 edges have distinct source/target pairs.
- Dagre version is 0.8.5 in both.
- React Flow is not deduping.

What's going wrong? 200 words max.
```

Codex returned the right diagnosis in one pass: `graphlib.setNode(v, value)` stores `value` by reference, and `dagre.layout()` mutates it to write x/y. The codebase's `resolveNodeSize` returned the same shared label object for every script node, so the last write won.

### Anti-patterns

- **Too short.** "Why is my dagre broken?" gets you garbage back.
- **No expected vs. actual.** Codex can't diagnose a mismatch you haven't described.
- **No "things ruled out."** Codex may waste its reasoning re-checking hypotheses you already verified.
- **No length cap.** You'll get a 1000-word essay when you wanted a diagnosis.

## After codex replies

1. **Verify before acting.** Codex's answer is a hypothesis, not ground truth. Check it against the actual code/behavior before making changes. It can confidently propose plausible-sounding fixes that are still wrong.
2. **Relay the relevant bit to the user.** Credit codex when the fix is non-obvious ("GPT-5.5 suggested checking X — verified, that's the bug").
3. **Save a memory if it's a recurring pattern.** If the diagnosis reveals a trap that could bite again in this codebase or in similar projects, save a feedback or project memory so future you applies the lesson directly.

## Iterating to consensus (multi-round reviews)

When codex is used to review a plan or approach (not one-shot debugging), the whole review is **one autonomous loop you own end to end**:

```
ask → get feedback → you judge agree/disagree → update the plan (or build a counter-argument)
     → ask again → … repeat … → consensus reached → THEN report to the user
```

Rules:

- **Do not pause for user confirmation between rounds.** After codex replies, decide yourself whether you agree. Agree → revise the plan and send the new version back to codex. Disagree → send back your reasoned rebuttal. Neither needs user sign-off.
- **Convergence test:** codex explicitly endorses ("sound", "agreed", "no objections") or only non-blocking refinements remain → consensus, report now. Substantive disagreement remains → keep iterating.
- **Break the loop early only for a genuine disagreement that needs a user decision** the user's standing instructions don't already cover (product semantics, architecture trade-off with no clear winner). A model suggesting a different approach is not, by itself, such a decision — resolve it in the loop.
- **Report once, at the end:** present the final converged plan plus the key round-trip conclusions. Do not relay each round's reply to the user as it arrives — per-round narration turns a fast convergence loop into human-stepped round-trips and defeats the point of a second opinion.

This is the general "don't treat intermediate nodes as stopping points" discipline applied to multi-round model review. The user wants the converged result, not to chaperone the iteration.

## Models and models.toml

`--model` accepts whatever models the user's codex install has configured. Defaults to what's in `~/.codex/config.toml`. `gpt-5.5` is the current go-to. If the user mentions a different codex model (e.g., a newer `gpt-6`), use that instead.

If you need to check what's available:

```bash
codex --help           # top-level flags
codex exec --help      # exec subcommand flags
```

## One last note

Don't abuse this. Every call consumes tokens and the user's attention. Reach for it when you're stuck — not every time you have a question you could answer yourself with a minute of thought or a grep.
