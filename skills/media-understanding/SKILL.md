---
name: media-understanding
description: >-
  Transcribe and understand local audio or video with Gemini.
  Use when the user provides a local recording, screen capture, or media file path.
allowed-tools: Bash(bun:*), Bash(yt-dlp:*), Bash(bili:*), Bash(ffmpeg:*), Bash(ffprobe:*)
metadata:
  kind: atom
---

# media-understanding

Local media file to transcription + structured digest.

## Script

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/gemini_media.ts <file> [--audio-only] [--question "Q"] [--chunk-minutes N]
```

Requires GEMINI_API_KEY; optional GEMINI_BASE_URL.

## Modes

- audio-only for speech-only (cheapest)
- full video when screen content matters
- media longer than one chunk is segmented automatically (default 30min audio /
  10min video), understood per segment, then merged. Output = merged digest +
  per-segment notes with absolute timestamps. `--chunk-minutes 0` disables it.

See workflow.md in references/.

Run in general-skills-executor. MEDIA_SKILL_DIR=${CLAUDE_SKILL_DIR} for cross-skill calls.
