---
name: gemini-media
description: >-
  Base skill: understand any local audio or video file by sending it to Gemini
  Flash-Lite (native multimodal — transcribes speech, reads on-screen text/slides,
  summarizes) cheaply and dependency-free. Trigger on "理解这个视频/音频文件",
  "转写这个视频/录音", "用 gemini 看/听这个文件", "transcribe this video/audio",
  "summarize this media file", "what is said in this recording", or whenever a
  media file needs to become text. Also the designated **no-subtitle fallback**
  for the youtube-cli and bilibili-cli skills. Heavy media reading happens inside
  Gemini, so the raw audio/transcript never fills the main context.
allowed-tools: Bash(python3:*), Bash(yt-dlp:*), Bash(bili:*), Bash(ffmpeg:*), Task
---

# gemini-media — understand audio/video with Gemini Flash-Lite

A base capability for turning a media **file** into text: transcription + a
structured understanding of what is said and shown. Gemini Flash-Lite is natively
multimodal and cheap — it reads speech *and* on-screen content (slides, code,
demos) that a pure ASR transcript would miss.

Two roles:
1. **Direct** — the user hands over a recording/screencast/video file to understand.
2. **Fallback** — when [[youtube-cli]] or [[bilibili-cli]] hits a video with no
   usable subtitles, download the media and route it here instead of giving up.

## Prerequisites

- `GEMINI_API_KEY` in the environment (and optionally `GEMINI_BASE_URL`; the
  script honors both, defaulting to the official endpoint).
- `ffmpeg` on PATH (only for `--audio-only`, which transcodes the input first).

## The script

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/gemini-media/scripts/gemini_media.py <file> [options]
# (in the repo directly: ~/.agents/skills/gemini-media/scripts/gemini_media.py)
```

It uploads the file via the Gemini File API, waits for processing, asks the model
to transcribe + digest, and prints the result. Dependency-free (stdlib `urllib`).

| Option | Effect |
|---|---|
| `--audio-only` | Transcode to 16k mono mp3 first. **The cheap default for "what does it say".** ~8× fewer tokens than video, and it makes *any* container (opus/webm/m4a) acceptable. |
| `--question "Q"` | Focus the digest on the user's question. |
| `--model M` | Default `gemini-3.1-flash-lite`. Use `gemini-2.5-flash-lite` for ~2.5× cheaper, slightly weaker. |
| `--prompt P` | Fully override the instruction sent to Gemini. |

## Choosing the mode

- **Audio-only (default)** — speech is the content (talks, tutorials narrated
  aloud, podcasts, interviews). Cheapest and robust. ~$0.007 for a 19-minute
  video on `gemini-3.1-flash-lite`.
- **Full video** (omit `--audio-only`, pass an actual video file like mp4/webm) —
  when the *screen* carries meaning the narration doesn't: unspoken on-screen
  code, UI walkthroughs where the speaker says "click here", chart-heavy talks.
  ~8× the audio cost; use deliberately.

## Getting the file

This skill consumes a local file — bring one, or download first:

```bash
# YouTube (audio for the cheap path; any container is fine with --audio-only)
yt-dlp "<url>" -f ba -o "/tmp/media.%(ext)s"
# YouTube (low-res video, for on-screen content)
yt-dlp "<url>" -f "bv*[height<=480]+ba/b[height<=480]" -o "/tmp/media.%(ext)s"
# Bilibili (full audio track)
bili audio "<BVID>" --no-split -o /tmp/
```

Then pass the downloaded file to the script (with `--audio-only` for audio
inputs). See `references/workflow.md` for the subagent template, cost math, and
the supported-format details.

## Keeping the main window clean

When this runs as part of a larger search-and-read workflow, dispatch it inside
the **Task tool** subagent on **Sonnet** (`claude-sonnet-4-6`) that is already
handling the item — the download and the script output stay in the subagent, and
only the final digest returns. For a one-off "understand this file I have", running
the script directly is fine: its output is already a compact digest.

## Resources

- **`scripts/gemini_media.py`** — media file → Gemini transcription + digest.
- **`references/workflow.md`** — subagent prompt template, cost math, supported
  formats, and per-platform download recipes.
