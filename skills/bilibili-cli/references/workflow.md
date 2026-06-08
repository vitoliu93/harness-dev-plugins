# bilibili-cli — subagent prompt template, quality rubric, `bili` reference

## Subagent prompt template

Spawn with the Task tool, `subagent_type: general-purpose`, on Sonnet (`claude-sonnet-4-6`).
Fill in the bvid and the user's actual question. The subagent runs one command,
reads the heavy subtitle itself, and returns only the digest below.

```
You are reading one Bilibili video to answer: "<USER QUESTION>".

Run this and read the full output:
  bili video <BVID> -s -c --ai --yaml

Then judge quality by combining the SUBTITLE (subtitle.text) with the COMMENTS
and the STATS (view/coin/like/favorite — see rubric). Return ONLY this digest —
never paste the raw subtitle:

  ## <title> — <UP主 author>
  - quality: high | medium | low  (one line of why: cite coin/like ratio + comment tone)
  - relevance to question: high | medium | low
  - key points (3–8 bullets)
  - claims the comments dispute or correct (or "none")
  - verdict: what to trust / what to ignore, best 1–2 quotes

Prefer reading ai_summary first to orient, then mine subtitle.text for detail.
Keep it under ~400 words (Chinese is fine). If off-topic or low quality, say so
in one line and stop.
```

## Quality rubric: content + 评论舆情 + 三连数据

Score by reading subtitle + comments + stats together.

**Content signals (subtitle / ai_summary):**
- Concrete steps, commands, numbers, and caveats vs vague hype.
- Does it match the current state of the tool/topic, or an outdated version?
- `ai_summary` gives the gist cheaply — use it to decide how deep to read.

**Stats signals — B站's quality fingerprint (strongest lever):**
- **投币 (coin) is the trust signal.** Coins are daily-limited; viewers spend
  them only on content they genuinely value. A high **coin/play** ratio (e.g.
  several percent) marks a respected video. Low coins on high plays = inflated
  or 标题党.
- **三连率**: like + coin + favorite relative to plays. High **favorite/play**
  means viewers saved it as a reference (strong for tutorials).
- **弹幕 (danmaku)** volume and tone reflect live engagement; "学到了",
  "前方高能", "感谢" = good; "退钱", "标题党", "划走" = bad.

**Sentiment signals (comments, like-sorted):**
- Top comment with high likes that **corrects or disputes** the video
  ("这里讲错了", "已经过时了", "新版不是这样") → quote the caveat with any claim.
- Specific praise ("讲得最清楚的一个", "终于懂了") → trust.
- Top comment is the UP主's own 引流/带货 or "关注我" → discount.
- "搬运的吧" / "营销号" / accusations of reposting → downgrade; may be stolen
  content.

**Combine:** high content + high coin ratio + specific praise = quote freely.
Good content + comments flagging it outdated = use, but lead with the caveat.
Thin content or 标题党 regardless of plays = low; report and move on.

## `bili` command reference

```bash
bili search "KEYWORD" --type video -n 20 --yaml   # search videos (default --type user)
bili search "KEYWORD" --type user --yaml          # search UP主 (creators)

bili video <BVID> -s -c --ai --yaml               # subtitle + comments + AI summary + stats (one shot)
bili video <BVID> -s                              # subtitle only
bili video <BVID> -st                             # subtitle WITH timeline (for timestamped quotes)
bili video <BVID> --ai                            # Bilibili's AI summary only (cheapest)
bili video <BVID> -r                              # related/recommended videos (widen the search)

bili user-videos <UID> --yaml                     # list a creator's videos (after finding a strong UP主)
bili hot --yaml ; bili rank --yaml                # trending / leaderboard (topic discovery)

bili audio <BVID> --no-split -o /tmp/             # no-subtitle fallback: full audio → gemini-media skill
bili audio <BVID>                                 # split into 25s 16kHz WAV segments (ASR-ready)
```

### Notes

- `--yaml` is the recommended format for agents (compact, structured). `--json`
  also available.
- `bili` is pre-authenticated (`bili status` to confirm); no cookie setup needed.
- Subtitles come back already deduped as plain text — no cleaning needed, unlike
  raw YouTube auto-captions.
- BVIDs (e.g. `BV1KjoxBoEQJ`) or full `bilibili.com/video/BV...` URLs both work.
- Found a consistently strong UP主? `bili user-videos <UID>` to mine their back
  catalogue instead of re-searching.
