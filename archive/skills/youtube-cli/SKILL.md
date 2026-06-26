---
name: youtube-cli
description: >-
  This skill should be used to search YouTube and extract what videos actually
  say — via yt-dlp search plus subtitle/transcript extraction — then judge
  content quality by combining the transcript with comment sentiment. Trigger on
  "search YouTube", "find videos about X", "what does this YouTube video say",
  "summarize/transcribe this video", "油管", "YouTube 上搜一下", "这个视频讲了啥",
  "总结这个 YouTube 视频". The heavy transcript reading is delegated to a Sonnet
  subagent so it never fills the main context.
allowed-tools: Bash(yt-dlp:*), Bash(python3:*), Task
---

# youtube-cli — search YouTube, read videos by their transcripts

YouTube hosts deep tutorials, talks, and reviews that text search misses. This
skill turns a topic into a ranked set of videos, then extracts each chosen
video's transcript and top comments so the content can actually be read — not
just listed.

**Core principle: quality = content + 评论舆情.** A video's view count says
nothing about whether it's accurate or just a thumbnail-bait. The comments do.
Always weigh the transcript against what commenters say (corrections, "this is
outdated", "best explanation I've seen", spam/ads) before trusting or quoting it.

**Core principle: keep the main window clean.** Transcripts are thousands of
tokens of low-density text. Never dump a raw transcript into the main context.
Delegate the fetch-and-read to a **Sonnet subagent** that returns only a
distilled, quality-assessed digest.

## Workflow

### 1. Search (main agent, cheap metadata)

```bash
yt-dlp "ytsearchN:KEYWORD" --flat-playlist \
  --print "%(id)s | %(title)s | %(duration)s | %(view_count)s | %(channel)s | %(upload_date)s" \
  --skip-download
```

Use `ytsearch20:` for breadth. Sort/shortlist on metadata: prefer recent videos
(API/tooling topics go stale fast), reasonable duration (a 30-second short
rarely has substance; a 3-hour stream is a poor first pick), and channels that
look like real creators over content farms. Pick the **2–5** most promising IDs.
Do not fetch transcripts for everything — that is the subagent's job and only
for the shortlist.

### 2. Dispatch a Sonnet subagent per shortlisted video (content understanding)

For each shortlisted video, spawn a subagent with the **Task tool**
(`subagent_type: general-purpose`), running it on **Sonnet**
(`claude-sonnet-4-6`) — content reading does not need Opus. The subagent runs the
bundled fetch script, reads the full transcript + comments, and returns a short
digest. The raw transcript stays inside the subagent.

The fetch script (one yt-dlp pass → clean markdown digest):

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/youtube-cli/scripts/yt_fetch.py <id> --comments 30
# (working in the repo directly: ~/.agents/skills/youtube-cli/scripts/yt_fetch.py)
```

It prints: title, channel, views/likes, description (with chapters), the
deduped transcript, and the top-N comments with like counts. See
`references/workflow.md` for the exact subagent prompt template and the quality
rubric the subagent must apply.

### 3. Synthesize (main agent)

Collect the digests. Cross-reference claims that appear across multiple videos,
flag any the comments disputed, and answer the user's question citing video
titles + timestamps/chapters. Surface the per-video quality verdict so the user
knows what to trust.

## When to run several in parallel

Shortlisting 3–5 videos? Dispatch the subagents concurrently (multiple Agent
calls in one message). Each returns an independent digest; synthesize after all
land.

## Fallbacks

- **No subtitles** (`## Transcript` shows "No subtitles available"): the video
  has no captions. The subagent should run `yt-dlp --list-subs <id>` to confirm
  and try `--langs` for another language. If still none, fall back to the
  **gemini-media** base skill — download the audio and let Gemini understand it:

  ```bash
  yt-dlp "<id>" -f ba -o "/tmp/m_<id>.%(ext)s"
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/gemini-media/scripts/gemini_media.py \
      /tmp/m_<id>.<ext> --audio-only --question "<the user's question>"
  ```

  Use low-res video (omit `--audio-only`) when on-screen content matters. Note in
  the digest that the read came from Gemini, not subtitles.
- **Members-only / age-gated / region-locked**: yt-dlp errors out; drop the
  video and pick the next shortlist candidate.
- **HTTP 429 on subtitles**: the script tolerates partial failure and salvages
  what downloaded; if everything 429s, wait and retry the single video.

## Resources

- **`scripts/yt_fetch.py`** — video → metadata + deduped transcript + top
  comments, as one markdown digest. Run by the subagent.
- **`references/workflow.md`** — subagent prompt template, the content+sentiment
  quality rubric, and yt-dlp flag reference.
