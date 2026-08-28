# media-understanding — subagent template, cost math, formats, download recipes

## Subagent prompt template (fallback role)

When an online video has no subtitles, a separate agent downloads the media
and runs this script itself, so the file and full transcript stay out of the
main window.

```
You are understanding one video that has NO subtitles, to answer: "<USER QUESTION>".

Download its audio, then have Gemini understand it:
  yt-dlp "<URL>" -f ba -o "/tmp/m_<ID>.%(ext)s"          # YouTube
  # or: bili audio "<BVID>" --no-split -o /tmp/           # Bilibili
  MEDIA_SKILL_DIR="<absolute path of the directory containing the loaded media-understanding/SKILL.md>"; \
  bun "$MEDIA_SKILL_DIR/scripts/gemini_media.ts" \
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
(a digest), so input dominates. **Default to `--audio-only`**; reach for video
only when the screen carries meaning the speech doesn't.

## Size vs. duration — two different problems

- **Size** (a 300MB screen recording): shrink it. The script does this itself
  above 100MB. One request, and it costs nothing extra — Gemini bills video by
  duration, so fewer bytes ≠ fewer tokens. This is the cheap path; prefer it.
- **Duration** (a 2h talk): segment it. Nothing but fewer minutes per request
  lowers the token count, and segmenting pays N+1 requests for it.

A 100MB+ 20-minute recording is a size problem only — it gets shrunk, not split.

## Long media (45min+ talks, streams, full YouTube lectures)

Media over **45 minutes** is segmented: each segment is understood separately,
then merged.

- Chunk defaults: 30min for audio, 10min for video (video bills 258 tok/s, so
  a 30min video chunk alone is ~465k tokens).
- Three segments upload and generate concurrently.
- `--chunk-minutes N` sets the chunk length and lowers the segmenting bar to N minutes.
- `--chunk-minutes 0` forces one request.

A long file that is also huge needs no special handling — the segmenting pass
re-encodes to 720p/1fps anyway, so size is solved on the way through.

- Output is the merged digest, then `# Segment notes` with one section per
  segment headed by its absolute range (`## 01:30:00–02:00:00`).
- A segment that fails is skipped and listed at the bottom; the rest still return.
- Segment prompts demand absolute timestamps, but the model sometimes emits a
  segment-relative one — the section header range is the reliable anchor.

Cost at 3h: audio-only ≈ 350k tokens (~$0.10 on `gemini-3.5-flash-lite`);
full video ≈ 2.8M tokens, only worth it when the screen carries the meaning.

Targeted follow-up on one part — cut the range from the local file and re-run
against the already-downloaded media instead of re-processing the whole thing:

```bash
ffmpeg -y -ss 01:30:00 -to 01:45:00 -i in.webm -ac 1 -ar 16000 slice.mp3
bun .../gemini_media.ts slice.mp3 --question "<targeted question>"
```

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
some environments (ffmpeg keyframe cut errors). Download the full audio, then
trim locally — see the `ffmpeg -ss/-to` recipe under "Long media".

## Endpoint notes

- The script reads `GEMINI_API_KEY` and `GEMINI_BASE_URL` from the environment.
  `GEMINI_BASE_URL` defaults to `https://generativelanguage.googleapis.com/v1beta`;
  the File API upload path is derived as `…/upload/v1beta/files`.
- Auth is sent as the `x-goog-api-key` header.
- Large files: the File API handles them via resumable upload; the script then
  polls until the file is `ACTIVE` (server-side processing) before generating.
- Video over 100MB is downscaled to 1080p/6fps by the script before upload
  (a 128MB Retina screen recording becomes ~4MB). Raw Retina captures stall the
  upload; every request also carries a 600s deadline so a stall errors out.
- Confirm the model id is listed on the endpoint: list with
  `curl -s "${GEMINI_BASE_URL}/models?key=${GEMINI_API_KEY}"`.
