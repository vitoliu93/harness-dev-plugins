# xiaohongshu-cli — subagent prompt template, quality rubric, image recipe, `xhs` reference

## Subagent prompt template

Spawn with the Task tool, `subagent_type: general-purpose`, on Sonnet (`claude-sonnet-4-6`).
Fill in the note id and the user's actual question. The subagent reads the heavy
note + comments (+ images if needed) and returns only the digest below.

```
You are reading one Xiaohongshu (小红书) note to answer: "<USER QUESTION>".

Run and read both:
  xhs read <ID> --yaml
  xhs comments <ID> --all --yaml

The TEXT (note_card.desc) is often just a teaser. If it is thin and the note is
a 图文 tutorial whose substance is in the image cards, download and VIEW them:
  curl -sL "<image_list[].url_default>" -o /tmp/xhs_<ID>_<n>.webp   # repeat per image
  # then use the Read tool on each /tmp/xhs_<ID>_<n>.webp to read the cards

Judge quality by combining the note content with the COMMENTS (舆情) and the
收藏/点赞 stats (see rubric). Return ONLY this digest — never paste raw bodies:

  ## <title> — @<nickname>
  - quality: high | medium | low  (one line: cite 收藏/点赞 ratio + comment tone; ad? 真人?)
  - relevance to question: high | medium | low
  - key points (3–8 bullets — the actual 干货, from text AND images)
  - comment 舆情: what buyers/users actually report (好评 / 避坑 / 踩雷 / "广子")
  - verdict: trust / discount, and the most useful 1–2 takeaways

Keep it under ~400 words (Chinese is fine). If it is a pure ad or off-topic, say
so in one line and stop.
```

## Quality rubric: content + 评论舆情 + 软广 detection

Score by reading note + comments + stats together. 小红书 is full of 软广 (soft
ads disguised as personal experience), so skepticism is the default.

**Content signals (desc + images):**
- First-hand and specific ("亲测", "自用三个月", "踩过的坑") vs generic 种草.
- 图文 tutorials: the real value is usually in the image cards — read them, do
  not judge from `desc` alone.
- Concrete details (prices, model numbers, exact steps, before/after) = real.

**Stats signals — 小红书's quality fingerprint:**
- **收藏 (collected_count) is the trust signal.** People save 干货 and references,
  not fluff. A high **收藏/点赞** ratio means readers found it genuinely useful.
  Lots of likes but few saves = pretty but shallow.
- High `comment_count` with substantive threads = the topic has real discussion.

**Sentiment signals (comments — read these carefully):**
- **避坑 / 踩雷 / 退货 / "翻车"** in top comments → the note may oversell; surface
  the warning with any recommendation.
- **"已购买，确实好用" / "亲测有效" / specific follow-up**  → corroboration; trust.
- **"广子吧" / "恰饭吗" / "求链接" flood / brand spam** → likely a 软广; discount.
- **`ip_location`** adds context (local tips, region-specific availability).
- Comments often contain the **answer the note omitted** (the real recipe, the
  cheaper alternative, the catch) — mine them.

**软广 / 营销号 red flags:** uniformly glossy photos, a single brand pushed hard,
"姐妹们冲" energy with no downsides, account that posts only one category, or
comments calling it out. When flagged, mark quality low regardless of likes.

**Combine:** real first-hand content + high 收藏 ratio + corroborating comments =
trust and quote. Good note + 避坑 comments = use, but lead with the warning.
软广 or thin = low; report and move on.

## Image-card reading recipe

When the text is thin and the content is in the images:

```bash
# image_list[].url_default holds the card URLs (from `xhs read`)
curl -sL "<url_default>" -o /tmp/xhs_card_1.webp
# repeat for each card, then Read each downloaded file (Read renders images)
```

Read the cards in order — 图文 tutorials are sequential. Pull the steps/specs
from them into the digest's key points.

## `xhs` command reference

```bash
xhs search "KEYWORD" --sort popular --yaml        # sort: general | popular | latest
xhs search "KEYWORD" --type image --yaml          # type: all | image | video
xhs search "KEYWORD" --page 2 --yaml              # next page of results

xhs read <id> --yaml                              # full note: title, desc, image_list, interact_info, type
xhs read <id> --xsec-token <tok> --yaml           # if a fresh token is needed (from search results)

xhs comments <id> --all --yaml                    # ALL comments (auto-paginate) — the 舆情
xhs sub-comments <note_id> <comment_id> --yaml    # replies under one comment

xhs search-user "KEYWORD" --yaml                  # find a creator
xhs user-posts <user_id> --yaml                   # a creator's notes (after finding a strong account)
xhs hot --yaml                                    # trending notes (topic discovery)
```

### Notes

- `--yaml` is the recommended agent format (compact, structured). `--json` also
  available.
- `xhs` is pre-authenticated (`xhs status` to confirm); cookies are read from the
  browser automatically.
- IDs come from `xhs search` results (`items[].id`); full note URLs work too.
- A note's `type` is `normal` (图文) or `video`. There is no transcript for video
  notes via `xhs` — fall back to `desc` + comments.
- Found a consistently good account? `xhs user-posts <user_id>` to mine it.
