---
name: media-understanding
description: >-
  Transcribe and understand local audio or video with Gemini.
  Use when the user provides a local recording, screen capture, or media file path.
allowed-tools: Bash(python3:*), Bash(yt-dlp:*), Bash(bili:*), Bash(ffmpeg:*)
metadata:
  kind: atom
---

# media-understanding

Local media file to transcription + structured digest.

## Script

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/gemini_media.py <file> [--audio-only] [--question "Q"]
```

Requires GEMINI_API_KEY; optional GEMINI_BASE_URL.

## Modes

- audio-only for speech-only (cheapest)
- full video when screen content matters

See workflow.md in references/.

Run in general-skills-executor. MEDIA_SKILL_DIR=${CLAUDE_SKILL_DIR} for cross-skill calls.
