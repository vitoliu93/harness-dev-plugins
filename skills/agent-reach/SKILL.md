---
name: agent-reach
description: >-
  Unified reach layer for video/social platforms (YouTube, Bilibili,
  Twitter/X);
allowed-tools: Bash(yt-dlp:*), Bash(python3:*)
---

# agent-reach — 平台内容触达封装层

Inspired by the open-source agent-reach: one skill that wraps how an agent
reaches platform content (YouTube / Bilibili / Twitter…), instead of one ad-hoc
approach per site. Each platform is a section below with its fetch recipe;
platforms are added as needs arrive.

**Keep the main window clean.** A transcript is thousands of tokens of
low-density text — this skill is meant to run inside a subagent that returns
only the distilled deliverable (summary, 学习大纲, quoted claims with
timestamps, each with section timestamps so the user can jump into the video).
In Claude Code the skill-guard hook enforces this by redirecting inline use to
the `general-skills-executor` subagent.

## YouTube — subtitle / transcript extraction

One script fetches metadata + deduped transcript (+ optional top comments) as a
single markdown digest:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/agent-reach/scripts/yt_fetch.py <url_or_id> [--comments 30] [--langs "en,zh-Hans,zh"]
# (loaded via the ~/.agents/skills symlink instead: ~/.agents/skills/agent-reach/scripts/yt_fetch.py)
```

Default langs try English + Chinese variants; auto-captions are cleaned of
rolling-window duplicates and inline timing tags. Read the full output
(metadata, description/chapters, transcript), produce the user's deliverable,
and never return the raw transcript.

### Fallbacks

- **No subtitles** (`## Transcript` says none available): run
  `yt-dlp --list-subs <url>` to see what languages exist and retry with
  `--langs`. If truly none, switch to the **media-understanding** skill — it
  owns the download-audio → Gemini transcribe/understand path. Note in the
  deliverable that the read came from Gemini, not subtitles.
- **HTTP 429 on subtitles**: the script salvages partial downloads; if all
  fail, wait and retry the single video.
- **Members-only / age-gated / region-locked**: yt-dlp errors out; report it.

### Search (when starting from a topic, not a URL)

```bash
yt-dlp "ytsearch20:KEYWORD" --flat-playlist --skip-download \
  --print "%(id)s | %(title)s | %(duration)s | %(view_count)s | %(channel)s | %(upload_date)s"
```

Shortlist 2–5 on metadata, then run the per-video flow above for each.

## Bilibili — not yet wired

Archived recipe exists at `archive/skills/bilibili-cli` (uses the `bili` CLI:
`bili video <BVID> -s -c --ai --yaml` for subtitle + comments + AI summary).
Port it into a section here when the need arrives.

## Twitter/X — not yet wired

Placeholder. Add fetch recipe when the need arrives.

## Resources

- **`scripts/yt_fetch.py`** — YouTube video → metadata + deduped transcript +
  top comments, one markdown digest.
