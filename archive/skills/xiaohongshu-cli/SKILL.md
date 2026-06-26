---
name: xiaohongshu-cli
description: >-
  This skill should be used to search Xiaohongshu (小红书/RED) and extract the
  real content of 图文 notes — via the `xhs` CLI's search, read, and comments —
  then judge quality by combining the note body + image cards with comment
  舆情 (避坑/踩雷/真实体验) and 收藏/点赞 signals. Xiaohongshu is a high-signal
  source for Chinese content: real first-hand reviews, tutorials, local
  knowledge, and recommendations — often far better than 百度 or 知乎. Trigger on
  "小红书搜一下", "小红书上关于X", "search Xiaohongshu", "RED", "种草", "避坑",
  "测评 / 真实体验", "find Chinese reviews". Heavy note reading is delegated to a
  Sonnet subagent so it never fills the main context.
allowed-tools: Bash(xhs:*), Bash(curl:*), Task
---

# xiaohongshu-cli — search 小红书, read 图文 notes for real Chinese content

Xiaohongshu is the best source for first-hand Chinese-language experience:
product reviews, how-to 干货, travel/local tips, and honest "避坑" notes. For
many Chinese queries it beats 百度 and 知乎 because the content is real people
sharing what actually worked. The `xhs` CLI handles auth (already logged in) and
exposes search, full-note read, and comments.

**Content is mostly 图文 (image + text).** The text `desc` is often just a
teaser — the substance frequently lives in the image cards (a tutorial laid out
across photos). Reading a note may require *viewing the images*, not only the
text.

**Core principle: quality = content + 评论舆情 + 收藏数据.** On 小红书 the comments
are gold — they hold "已购买，确实好用", "踩雷了", "广子吧" (it's an ad), and
follow-up Q&A that the note itself omits. And 收藏 (saves) is the strongest
"genuinely useful" signal — people save 干货, not marketing fluff. Always weigh
the note against its comments AND its like/save counts.

**Core principle: keep the main window clean.** Note bodies, comment threads, and
images are bulky. Never dump them into the main context. Delegate the
fetch-and-read to a **Sonnet subagent** that returns only a distilled,
quality-assessed digest.

## Workflow

### 1. Search (main agent, cheap metadata)

```bash
xhs search "KEYWORD" --sort popular --yaml      # or --sort latest / general; --type image|video|all
```

Each result carries `id`, `note_card.title`, `user.nickname`, and `interact_info`
(`liked_count`, `collected_count`, `comment_count`, `shared_count`). Shortlist on
metadata: prefer a **high 收藏/点赞 ratio** (saved-for-reference = real value),
healthy comment counts, and titles promising concrete experience over generic
种草. Pick the **2–5** best note `id`s.

### 2. Dispatch a Sonnet subagent per shortlisted note (content understanding)

For each shortlisted note `id`, spawn a subagent with the **Task tool**
(`subagent_type: general-purpose`), running it on **Sonnet**
(`claude-sonnet-4-6`) — content reading does not need Opus. The subagent reads the
note body + comments (and the image cards when the text is thin) and returns a
short digest. The bulky raw content stays inside the subagent.

The fetch commands:

```bash
xhs read <id> --yaml             # title, desc (text body), image_list (urls), interact_info, type
xhs comments <id> --all --yaml   # all comments: content, like_count, ip_location, sub_comments
```

When `desc` is thin and the note is a 图文 tutorial whose steps live in the
images, the subagent downloads the `image_list` `url_default` images with `curl`
and views them with the Read tool. See `references/workflow.md` for the exact
subagent prompt template, the 软广/quality rubric, and the image-reading recipe.

### 3. Synthesize (main agent)

Collect the digests, cross-reference repeated advice, surface the consensus
(what multiple notes + comments agree on) and the 避坑 warnings, and answer
citing note titles + authors. Flag any note the comments outed as an ad.

## When to run several in parallel

Shortlisting 3–5 notes? Dispatch the subagents concurrently (multiple Agent
calls in one message), then synthesize once all digests land.

## Fallbacks

- **`read` needs a token**: if a note fails to load, re-run `xhs search` to get a
  fresh `xsec_token` and pass `--xsec-token`; tokens are cached per note.
- **Note is a video, not 图文** (`type: video`): there's no transcript via `xhs`;
  rely on `desc` + comments, and note the read is description-based.
- **Comment-heavy note**: `xhs comments --all` auto-paginates; for a thread the
  subagent cares about, `xhs sub-comments <note_id> <comment_id>` pulls replies.

## Resources

- **`references/workflow.md`** — subagent prompt template, the
  content+舆情+软广 quality rubric, the image-card reading recipe, and the full
  `xhs` command reference.
