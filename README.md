# vito-agent-plugins

Vito's global skill collection, packaged as a Claude Code plugin. The repo root
is the plugin root — all 14 skills under `skills/` and 8 subagents under
`agents/` are auto-discovered.

## Install

This repo doubles as its own marketplace. From any machine with the repo checked
out (e.g. at `~/codebase/projects/agent-plugins`):

```
/plugin marketplace add ~/codebase/projects/agent-plugins
/plugin install vito-agent-plugins@vito-agents
```

Then restart the session. Skills become available as `vito-agent-plugins:<skill>`
(e.g. `/vito-agent-plugins:advanced-plan`).

## Skills

| Skill | What it does |
|---|---|
| advanced-plan | Track a non-trivial dev task as a mini-project that survives context resets and handoff. |
| ask-codex | Consult OpenAI Codex CLI for a second opinion on hard problems. |
| audit-context | Audit, prune, and lean-refactor session context (CLAUDE.md, memory, imports). |
| bilibili-cli | Search B站 and read videos by subtitle + AI summary + comment 舆情 (via `bili`). |
| cc-reflection | Research-grounded reflection report on collaboration over a date range. |
| exa-code | Search the web for code examples, docs, and programming solutions via Exa. |
| gemini-media | Base skill: understand any audio/video file via Gemini Flash-Lite (no-subtitle fallback for the video skills). |
| handoff | Save / pick up task state for cross-session, cross-agent transfer. |
| harness-loop | Autonomous orient → plan → execute → observe → decide → persist loop methodology. |
| html-doc | Produce a single self-contained, infographic-style HTML explainer. |
| self-learn | Extract knowledge from the session into Chinese learning notes. |
| tech-selection | Track an open research/feasibility question as a resumable study. |
| xiaohongshu-cli | Search 小红书 and read 图文 notes + comment 舆情 for real Chinese content (via `xhs`). |
| youtube-cli | Search YouTube and read videos by transcript + comment sentiment (via yt-dlp). |

## Subagents

Eight skills also ship a companion subagent (spawnable via the Agent/Task tool as
`vito-agent-plugins:<agent>`). Each wraps its skill in an isolated context so the
noisy intermediate work — transcripts, search dumps, upload logs — never enters
the main session; only a distilled answer comes back. The other six skills are
deliberately *not* wrapped: they either need the live session conversation
(handoff, self-learn), are interactive end-to-end (audit-context), or are
methodologies the main agent itself must drive (advanced-plan, harness-loop,
tech-selection).

| Agent | Wraps skill | Returns |
|---|---|---|
| bilibili-researcher | bilibili-cli | Quality-assessed digest of B站 videos, cited by BVID. |
| cc-reflector | cc-reflection | Report path + Lark URL + top findings + critic tally. |
| codex-second-opinion | ask-codex | Distilled GPT diagnosis + verification note. |
| exa-searcher | exa-code | Synthesized answer + sources from Exa web/code search. |
| html-visualizer | html-doc | Path of the written HTML artifact + pattern rationale. |
| media-reader | gemini-media | Structured digest (or verbatim transcript on request). |
| xiaohongshu-researcher | xiaohongshu-cli | 小红书 consensus + 避坑/软广 flags, cited by note. |
| youtube-researcher | youtube-cli | Per-video verdicts with timestamps + synthesis. |

Note: Claude Code subagents cannot spawn nested subagents, so the wrappers read
content inline with strict distillation discipline instead of fanning out the
per-video/per-note readers their skills describe for main-session use.

## Layout

```
.claude-plugin/
  plugin.json        # plugin manifest (name: vito-agent-plugins)
  marketplace.json   # marketplace (name: vito-agents), plugin source "./"
skills/              # 14 skills, auto-discovered
agents/              # 8 companion subagents, auto-discovered
```

## Note on portability

Several skills (`cc-reflection`, `advanced-plan`, `tech-selection`, `exa-code`)
reference their own scripts/assets via hardcoded `~/.claude/skills/<name>/...` (or
repo-relative `skills/<name>/...`) paths. When loaded as a plugin, skills live in
the plugin cache, not `~/.claude/skills`, so those hardcoded paths do **not**
resolve — those skills need `${CLAUDE_PLUGIN_ROOT}`-relative paths to be fully
portable. The packaging here does not modify skill internals; fix those paths if
you hit a missing-file error when a skill tries to read its own assets.
