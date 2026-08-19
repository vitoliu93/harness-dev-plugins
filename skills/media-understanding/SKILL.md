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
MEDIA_SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bun "$MEDIA_SKILL_DIR/scripts/gemini_media.ts" <file> [--audio-only] [--question "Q"] [--chunk-minutes N]
```

Requires GEMINI_API_KEY; optional GEMINI_BASE_URL.

## Modes

- audio-only for speech-only (cheapest)
- full video when screen content matters
- big files (screen recordings, 100MB+) are shrunk and still ride one request —
  cheaper than segmenting, since Gemini bills video by duration, not bytes
- only media over 45min is segmented (30min audio / 10min video chunks),
  understood per segment, then merged. Output = merged digest + per-segment notes
  with absolute timestamps. `--chunk-minutes 0` disables, `--chunk-minutes N`
  forces N-minute chunks on anything longer than N.

See workflow.md in references/.

Run in general-skills-executor. For cross-skill calls, set `MEDIA_SKILL_DIR` to
the absolute directory containing the loaded `media-understanding/SKILL.md`.
