# youtube-cli — subagent prompt template, quality rubric, yt-dlp reference

## Subagent prompt template

Spawn with the Task tool, `subagent_type: general-purpose`, on Sonnet (`claude-sonnet-4-6`).
Fill in the video id and the user's actual question. The subagent runs the
script, reads the heavy transcript itself, and returns only the digest below.

```
You are reading one YouTube video to answer: "<USER QUESTION>".

Run this and read the full output:
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/youtube-cli/scripts/yt_fetch.py <VIDEO_ID> --comments 30
(If ${CLAUDE_PLUGIN_ROOT} is unset, use ~/.agents/skills/youtube-cli/scripts/yt_fetch.py)

Then judge quality by combining the TRANSCRIPT with the COMMENTS (see rubric),
and return ONLY this digest — never paste the raw transcript:

  ## <title> — <channel>
  - quality: high | medium | low  (one line of why, citing the comment signal)
  - relevance to question: high | medium | low
  - key points (3–8 bullets, each with the chapter/timestamp if available)
  - claims the comments dispute or correct (or "none")
  - verdict: what to trust / what to ignore, and the best 1–2 quotes (with time)

Keep it under ~400 words. If the video is off-topic or low quality, say so in one
line and stop.
```

## Quality rubric: content + 评论舆情

Score each video by reading the transcript AND the comments together. Neither
alone is enough — a polished transcript can be confidently wrong; a small
channel can be excellent.

**Content signals (transcript):**
- Specific and demonstrated vs vague and motivational. Real commands, numbers,
  steps, and caveats beat hype.
- Structure: chapters/description outline usually means a prepared, denser video.
- Currency: does it match the current state of the tool/topic, or describe a
  version that no longer exists?

**Sentiment signals (comments) — the deciding factor:**
- **Positive, specific** praise ("the part at 6:00 finally made X click",
  "best explanation of Y") → trust.
- **Corrections / disputes** ("this is outdated", "step 3 is wrong now",
  "doesn't work since the v2 update") → quote those caveats alongside any claim.
- **Top comment is the creator's own ad / "join my course" with high likes
  only because pinned** → discount; the audience may be there for marketing.
- **Complaints about clickbait / "nothing new" / "20 min for 2 min of content"**
  → downgrade to low even with high views.
- **Empty or all-emoji comments on a high-view video** → engagement-farmed;
  treat metadata as unreliable.

**Combine:** high content + positive specific comments = quote freely. Good
content + comments flagging it as outdated = use, but lead with the caveat. Thin
content regardless of comments = low; report and move on.

## yt-dlp reference

```bash
# Search, metadata only (fast, no download)
yt-dlp "ytsearch20:KEYWORD" --flat-playlist \
  --print "%(id)s | %(title)s | %(duration)s | %(view_count)s | %(channel)s" --skip-download

# What subtitle tracks exist (diagnose "no transcript")
yt-dlp --list-subs <id>

# Manual subs in one language, as srt, no video
yt-dlp <id> --skip-download --write-subs --sub-langs "en" --sub-format vtt --convert-subs srt -o "%(id)s.%(ext)s"

# Auto-generated captions (most videos), translated to a language
yt-dlp <id> --skip-download --write-auto-subs --sub-langs "en" -o "%(id)s.%(ext)s"

# Comments, top-sorted, capped (sentiment signal)
yt-dlp <id> --skip-download --write-comments \
  --extractor-args "youtube:comment_sort=top;max_comments=30,30,0,0" -o "%(id)s.%(ext)s"
```

### yt_fetch.py flags

- `--comments N` — fetch up to N top-level comments (default 0 = skip; 30 is plenty).
- `--langs L` — subtitle preference in yt-dlp `--sub-langs` syntax. Default
  `en,en-orig,zh-Hans,zh-Hant,zh`. Narrow it (avoid broad `en.*` wildcards) to
  dodge the subtitle-endpoint 429 rate limit.

### Notes

- The script does ONE yt-dlp pass (info.json + subs + optional comments) and is
  resilient: if some subtitle languages 429, it salvages whatever downloaded.
- Auto-captions arrive as a rolling window with duplicated lines and inline
  `<00:00:01.234><c>` word timing; the script strips both into clean prose.
- `max_comments` format is `total,top-level,replies,replies-per-thread`. Using
  `N,N,0,0` skips reply threads — faster and enough for sentiment.
