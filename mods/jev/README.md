# dev-kit-jev

A Claude Code Mod. On each prompt you type it asks Jev two things — which of
your installed skills fit this task, and which past sessions are worth
re-reading — and adds the answer as hidden context. Advice only: it never
invokes a skill or starts an agent.

Claude Code only. Codex ignores this directory.

## Install

```
/plugin marketplace add <checkout-path>
/plugin install dev-kit-jev@vito-agents
```

**Function hooks must be enabled or this Mod never loads.** Anthropic's mods
doc: *hooks modules load only where function hooks are enabled*. Set it once in
your settings instead of typing it before every command:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

**The key is the only switch.** Export `TYPESAFE_API_KEY` (or set the `apiKey`
option). With the plugin installed and a key in your shell — a lot of people
export it in `.zshrc` — every prompt you type starts going to TypeSafe; there is
no separate on/off flag. To stop that, remove the key or uninstall the plugin.
With no key it does nothing at all: no request, no injection, no warning.

### From source, for debugging

```bash
claude --plugin-dir <checkout-path>/mods/jev
```

`claude --help` on `--plugin-dir`: *for this session only*. Use it while working
on the Mod; normal use is the install above.

Options go in user or `--settings` settings under
`pluginConfigs["dev-kit-jev"].options` (project settings are not read):

| Option | Default | Meaning |
|---|---|---|
| `apiKey` | — | TypeSafe key. Prefer the environment variable. |
| `model` | `jev-1.13.0` | TypeSafe model version. |
| `timeoutMs` | `3000` | Extra time budget per prompt, clamped to 200–8000. |

## What the model sees

Only when something matched. A `<jev-skills>` block listing every skill Jev
scored at 0.75 or above, best first, with no cap on the count — and a
`<session-precedents>` block with up to three past sessions and their
transcript paths. Nothing matched means nothing is injected. Both blocks say in
plain words that they are advice and untrusted data; your instructions,
`orchestrate` team order and `use-agents` quota checks still win.

## Which skills are candidates

Every `*/SKILL.md` under `<cwd>/skills`, `~/.claude/skills`,
`~/.agents/skills`, and the `skills/` directory of each installed plugin that is
not disabled in `~/.claude/settings.json`. Only the frontmatter `name` and
`description` are read, verbatim (capped at 200 characters); the body is never
opened. The same name from several places counts once, workspace first, then
user directories, then plugins. A plugin's skill is named `plugin:skill`.

The scan runs in a separate read-only process (`scripts/scan-skills.ts`) and
its result is cached for five minutes per working directory, so a new skill
shows up within five minutes or on restart.

## What leaves this machine

Sent: the current prompt (≤3000 chars), recent user/assistant messages, skill
names with their descriptions, and ccobs summaries. Messages are picked from
the newest backwards (≤2000 chars each, at most 25,000 in all) and sent in
time order. Never sent: tool output (file reads and command output live
there), local paths (a `/Users/...`, `/home/...` or `~/...` path becomes
`[PATH]`) and any string matching a key shape — redaction runs before
truncation (`hooks/core.ts`). Anything you paste into the conversation is a
normal message and is sent.

The whole request is capped at 40 KB, counted in UTF-8 bytes. To fit, messages
are dropped oldest-first, then skills last-first (plugin skills go before
workspace ones); precedents go last-first only after every skill is gone. With about 70 skills on this
kind of setup only the newest message or two remain, and with more than
roughly 80 skills the last ones are not scored. The debug line names how many
skills were scored.

History candidates come from obs.db, read through a separate read-only process
(`scripts/recall-candidates.ts`); `CCOBS_DIR` overrides its location for testing.

## Legacy recall

While this Mod owns a session it sets `DEVKIT_JEV_RECALL_SESSION`, and
`hooks/scripts/recall-precedent.ts` returns without doing anything — one recall
per turn, never two. Ownership starts as soon as a key is present, even
if the Jev call then fails, so a failure does not fall through to a second model
call. Codex, other sessions and sessions without the Mod keep the hook, which
asks Jev itself when `TYPESAFE_API_KEY` is set (up to 24 candidates, 5-second
cap) and falls back to pi only when there is no key.

## When it breaks

Timeout, HTTP error, bad response, missing obs.db, no skills found, request
over 40 KB: the prompt goes through unchanged and a line lands in the debug log
only. The prompt is never dropped or edited, and `next()` is called exactly
once.

## Check it is working

```bash
claude --plugin-dir <checkout-path>/mods/jev --debug-file /tmp/jev.log ...
rg 'dev-kit-jev' /tmp/jev.log
```

Look for `hooks module dev-kit-jev@inline loaded ... events: prompt.submit`
(loaded), `dev-kit-jev: 2 skill suggestion(s), 1 reference(s)` (a decision
came back) and `prompt.submit settled in ...ms` (what it cost you).

## Live check against the real API

```bash
TYPESAFE_API_KEY=... bun mods/jev/scripts/live-eval.ts
```

Eight fictional cases — fictional skills, fictional history, fictional prompts.
It prints one line per case plus a p50. Nothing from your own sessions is sent.
Small sample: it shows the wiring works, not an accuracy or latency guarantee.

## Recommendation quality against your real catalogue

```bash
TYPESAFE_API_KEY=... bun mods/jev/scripts/quality-eval.ts
```

Scans the skills this machine actually has (names and descriptions leave the
machine, exactly as on every prompt) and runs prompts with a known answer built
around the dev-kit skills: one direct hit per skill, follow-ups only the
context can resolve, hard negatives that share a word with a skill but are not
its job, and two multi-skill tasks. Every other installed skill is a
distractor. It prints the top five scores per case, recall, false positives
and the margin between the lowest wanted score and the highest unwanted one;
the 0.75 threshold has to sit between them.
