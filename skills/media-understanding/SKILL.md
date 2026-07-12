---
name: media-understanding
description: >-
  Understand any local audio/video content.
allowed-tools: Bash(python3:*), Bash(yt-dlp:*), Bash(bili:*), Bash(ffmpeg:*)
---

# media-understanding — understand audio/video with Gemini Flash-Lite

A base capability for turning a media **file** into text: transcription + a
structured understanding of what is said and shown. Gemini Flash-Lite is natively
multimodal and cheap — it reads speech _and_ on-screen content (slides, code,
demos) that a pure ASR transcript would miss.

Two roles:

1. **Direct** — the user hands over a recording/screencast/video file to understand.
2. **Fallback** — when [[agent-reach]] hits a video with no
   usable subtitles, download the media and route it here instead of giving up.

## Prerequisites

- `GEMINI_API_KEY` in the environment (and optionally `GEMINI_BASE_URL`; the
  script honors both, defaulting to the official endpoint).
- `ffmpeg` on PATH (only for `--audio-only`, which transcodes the input first).

## The script

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/media-understanding/scripts/gemini_media.py <file> [options]
# (in the repo directly: ~/.agents/skills/media-understanding/scripts/gemini_media.py)
```

It uploads the file via the Gemini File API, waits for processing, asks the model
to transcribe + digest, and prints the result. Dependency-free (stdlib `urllib`).

| Option           | Effect                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--audio-only`   | Transcode to 16k mono mp3 first. **The cheap default for "what does it say".** ~8× fewer tokens than video, and it makes _any_ container (opus/webm/m4a) acceptable. |
| `--question "Q"` | Focus the digest on the user's question.                                                                                                                             |
| `--model M`      | Default `gemini-3.1-flash-lite`. Use `gemini-2.5-flash-lite` for ~2.5× cheaper, slightly weaker.                                                                     |
| `--prompt P`     | Fully override the instruction sent to Gemini.                                                                                                                       |

## Choosing the mode

- **Audio-only (default)** — speech is the content (talks, tutorials narrated
  aloud, podcasts, interviews). Cheapest and robust. ~$0.007 for a 19-minute
  video on `gemini-3.1-flash-lite`.
- **Full video** (omit `--audio-only`, pass an actual video file like mp4/webm) —
  when the _screen_ carries meaning the narration doesn't: unspoken on-screen
  code, UI walkthroughs where the speaker says "click here", chart-heavy talks.
  ~8× the audio cost; use deliberately.

## Getting the file

This skill consumes a local file — bring one, or download first. The common
case:

```bash
yt-dlp "<url>" -f ba -o "/tmp/media.%(ext)s"   # audio; any container is fine with --audio-only
```

All per-platform recipes (low-res video, Bilibili, clip trimming) live in
`references/workflow.md`, along with the cost math and supported-format details.

## Keeping the main window clean

This skill is meant to run inside a subagent — the download and the raw
script output stay there, only the final digest returns. In Claude Code the
skill-guard hook enforces this by redirecting inline use to the
`general-skills-executor` subagent (model: sonnet).

## Resources

- **`scripts/gemini_media.py`** — media file → Gemini transcription + digest.
- **`references/workflow.md`** — subagent prompt template, cost math, supported
  formats, and per-platform download recipes.
