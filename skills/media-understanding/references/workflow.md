# media-understanding — subagent template, cost math, formats, download recipes

## Subagent prompt template (fallback role)

When an online video has no subtitles, the content-understanding subagent
(`general-skills-executor`, model: sonnet) downloads the media and runs this
script itself, so the file and full transcript stay out of the main window.

```
You are understanding one video that has NO subtitles, to answer: "<USER QUESTION>".

Download its audio, then have Gemini understand it:
  yt-dlp "<URL>" -f ba -o "/tmp/m_<ID>.%(ext)s"          # YouTube
  # or: bili audio "<BVID>" --no-split -o /tmp/           # Bilibili
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/media-understanding/scripts/gemini_media.py \
      /tmp/m_<ID>.<ext> --audio-only --question "<USER QUESTION>"

Read the digest it prints. If comment sentiment is needed for the quality
judgement, add `--write-comments` to the same yt-dlp call and read the sidecar
.info.json — no second fetch. Return ONLY the platform skill's standard digest
format — never paste the transcript. Note in the digest that the read came from
Gemini audio understanding, not subtitles.

If the screen content matters (on-screen code/UI the narration skips), instead
download low-res video and omit --audio-only.
```

## Cost math

Gemini bills media by duration. Audio ≈ 32 tokens/sec; video ≈ 258 tokens/sec
(1 fps sampling) and **video-with-audio bills both**.

| Input | Tokens (20 min) | `gemini-3.5-flash-lite` in-cost ($0.30/Mtok) |
|---|---|---|
| audio-only | ~38k | ~$0.011 |
| full video | ~310k + audio | ~$0.11 |

`gemini-2.5-flash-lite` is ~3× cheaper on input ($0.10/Mtok). Output is small
(a digest), so input dominates. Verified: a 19-min talk via `--audio-only` cost
~29.6k tokens. **Default to `--audio-only`**; reach for video only when the
screen carries meaning the speech doesn't.

## Supported formats

Gemini's audio endpoint accepts wav, mp3, aiff, aac, ogg, flac — but **not**
`audio/mp4` (m4a) or raw webm-audio, which are exactly what `yt-dlp -f ba` and
`bili audio` produce. `--audio-only` sidesteps this entirely by transcoding to
16k mono mp3 with ffmpeg first, so any container works. For full-video mode, pass
mp4 or webm directly.

## Per-platform download recipes

```bash
# --- YouTube (yt-dlp) ---
yt-dlp "<url>" -f ba -o "/tmp/m.%(ext)s"                       # audio (use --audio-only)
yt-dlp "<url>" -f "bv*[height<=480]+ba/b[height<=480]" -o "/tmp/m.%(ext)s"   # low-res video

# --- Bilibili (bili) ---
bili audio "<BVID>" --no-split -o /tmp/                        # full audio track (m4a; use --audio-only)
# (bili splits into 16k WAV segments by default — --no-split gives one file)

# --- Any other site yt-dlp supports ---
yt-dlp "<url>" -f ba -o "/tmp/m.%(ext)s"
```

Note: `yt-dlp --download-sections` to grab only part of a video is unreliable in
some environments (ffmpeg keyframe cut errors). To sample a clip, download the
full audio then trim locally: `ffmpeg -y -i in.webm -t 120 -ac 1 -ar 16000 out.mp3`.

## Endpoint notes

- The script reads `GEMINI_API_KEY` and `GEMINI_BASE_URL` from the environment.
  `GEMINI_BASE_URL` defaults to `https://generativelanguage.googleapis.com/v1beta`;
  the File API upload path is derived as `…/upload/v1beta/files`.
- Auth is sent as the `x-goog-api-key` header.
- Large files: the File API handles them via resumable upload; the script then
  polls until the file is `ACTIVE` (server-side processing) before generating.
- Confirm the model id is listed on the endpoint: list with
  `curl -s "${GEMINI_BASE_URL}/models?key=${GEMINI_API_KEY}"`.
