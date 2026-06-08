---
name: bilibili-cli
description: >-
  This skill should be used to search Bilibili (B站/哔哩哔哩) and extract what
  videos actually say — via the `bili` CLI's search plus one-shot subtitle + AI
  summary + comments fetch — then judge content quality by combining the
  transcript with comment/弹幕 sentiment and B站's coin/like/favorite signals.
  Trigger on "search Bilibili", "B 站上搜一下", "哔哩哔哩", "这个 B 站视频讲了啥",
  "总结这个 B 站视频", "find Chinese video tutorials", "UP 主". The heavy
  subtitle reading is delegated to a Sonnet subagent so it never fills the main
  context. Bilibili is strong for Chinese-language tutorials, tech talks, and
  reviews.
allowed-tools: Bash(bili:*), Bash(python3:*), Task
---

# bilibili-cli — search B站, read videos by their subtitles

Bilibili is the best source for in-depth Chinese-language video content:
tutorials, tech talks, reviews, and explainers that often beat the Chinese text
web. The `bili` CLI handles auth (already logged in) and does the heavy lifting
— search, clean subtitle extraction, comments, and Bilibili's own AI summary —
so this skill is mostly orchestration.

**Core principle: quality = content + 评论舆情 + 三连数据.** On B站, coins
(投币) are the strongest quality signal — they are limited daily and viewers
spend them only on genuinely good content. Always weigh subtitle content against
comments AND the like/coin/favorite stats before trusting or quoting a video.

**Core principle: keep the main window clean.** A subtitle for a long video is
thousands of tokens. Never dump it into the main context. Delegate the
fetch-and-read to a **Sonnet subagent** that returns only a distilled,
quality-assessed digest.

## Workflow

### 1. Search (main agent, cheap metadata)

```bash
bili search "KEYWORD" --type video -n 20 --yaml
```

Returns `bvid`, `title`, `author`, `play` (播放量), `duration` per result.
Shortlist on metadata: prefer real play counts, sensible duration, and titles
that promise substance over 标题党 (clickbait — "震惊", "最强", excessive "！").
Pick the **2–5** best `bvid`s. `--yaml` is the agent-friendly format.

### 2. Dispatch a Sonnet subagent per shortlisted video (content understanding)

For each shortlisted `bvid`, spawn a subagent with the **Task tool**
(`subagent_type: general-purpose`), running it on **Sonnet**
(`claude-sonnet-4-6`) — content reading does not need Opus. The subagent runs one
command, reads the result, and returns a short digest. The raw subtitle stays
inside the subagent.

The one-shot fetch (subtitle + comments + AI summary + stats):

```bash
bili video <BVID> -s -c --ai --yaml
```

This returns everything in one call:
- `video.stats` — view, danmaku (弹幕), like, coin (投币), favorite, share
- `subtitle.available` / `subtitle.text` — clean plain-text subtitle (already deduped)
- `ai_summary` — Bilibili's native AI summary (a cheap first-pass)
- `comments` — top comments, like-sorted, each with `like` count

See `references/workflow.md` for the exact subagent prompt template and the
B站-specific quality rubric.

### 3. Synthesize (main agent)

Collect the digests, cross-reference repeated claims, flag anything the comments
disputed, and answer citing video titles + the relevant points. Surface each
video's quality verdict (and the coin/like signal) so the user knows what to
trust.

## When to run several in parallel

Shortlisting 3–5 videos? Dispatch the subagents concurrently (multiple Agent
calls in one message), then synthesize once all digests land.

## Fallbacks

- **No subtitle** (`subtitle.available: false`): many B站 videos lack CC. First
  lean on `ai_summary` + `comments` + `description` (often enough). For a critical
  video with no subtitle, fall back to the **gemini-media** base skill — download
  the audio and let Gemini understand it:

  ```bash
  bili audio "<BVID>" --no-split -o /tmp/
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/gemini-media/scripts/gemini_media.py \
      "/tmp/<downloaded m4a>" --audio-only --question "<the user's question>"
  ```

  Note in the digest that the read came from Gemini, not subtitles.
- **Paid / charged (充电) / member-only video**: `bili video` errors; drop it
  and take the next shortlist candidate.

## Resources

- **`references/workflow.md`** — subagent prompt template, the
  content+sentiment+三连 quality rubric, and the full `bili` command reference.
