#!/usr/bin/env python3
"""Fetch a YouTube video as one clean markdown digest: metadata + transcript + top comments.

Single yt-dlp pass writes info.json (+ optional comments) and subtitle files to a
temp dir, then this script cleans the rolling-window auto-caption duplicates into a
plain transcript and prints everything as markdown to stdout.

Designed to be run by a content-understanding subagent so the raw transcript never
touches the main window context — the subagent reads this output, judges quality
against the comments, and returns only a distilled summary.

Usage:
    yt_fetch.py <url_or_id> [--comments N] [--langs "en.*,zh-Hans,zh-Hant,zh"]

    --comments N   fetch up to N top-level comments (default 0 = skip; ~30 is plenty)
    --langs L      subtitle language preference, yt-dlp --sub-langs syntax
                   (default tries English + Chinese variants)
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile


def clean_subs(path):
    """VTT/SRT -> deduped plain text. Auto-captions repeat each line in a rolling
    window and carry inline <00:00:01.234><c> word timing; strip both."""
    out, last = [], None
    for ln in open(path, encoding="utf-8", errors="ignore").read().splitlines():
        if ln.startswith(("WEBVTT", "Kind:", "Language:")) or "-->" in ln:
            continue
        if re.match(r"^\s*$", ln) or re.match(r"^\d+$", ln):  # blank / srt index
            continue
        txt = re.sub(r"<[^>]+>", "", ln).strip()  # drop <c>/<timestamp> tags
        txt = re.sub(r"\s+", " ", txt)
        if not txt or txt == last:
            continue
        out.append(txt)
        last = txt
    return "\n".join(out)


def pick_sub(workdir):
    """Prefer a manual sub over auto; prefer .srt over .vtt. Returns (path, lang) or (None, None)."""
    files = glob.glob(os.path.join(workdir, "*.srt")) + glob.glob(os.path.join(workdir, "*.vtt"))
    if not files:
        return None, None
    # manual subs lack the language model's auto markers; yt-dlp names auto subs the
    # same, so just take the first by our srt>vtt ordering.
    chosen = files[0]
    m = re.search(r"\.([\w-]+)\.(srt|vtt)$", os.path.basename(chosen))
    return chosen, (m.group(1) if m else "?")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--comments", type=int, default=0)
    ap.add_argument("--langs", default="en,en-orig,zh-Hans,zh-Hant,zh")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory(prefix="yt_fetch_") as wd:
        cmd = [
            "yt-dlp", args.url, "--skip-download",
            "--write-info-json",
            "--write-subs", "--write-auto-subs",
            "--sub-langs", args.langs, "--sub-format", "vtt",
            "--convert-subs", "srt",
            "-o", os.path.join(wd, "v.%(ext)s"),
            "--no-warnings", "--ignore-errors", "--sleep-subtitles", "1",
        ]
        if args.comments > 0:
            cmd += ["--write-comments", "--extractor-args",
                    f"youtube:comment_sort=top;max_comments={args.comments},{args.comments},0,0"]
        r = subprocess.run(cmd, capture_output=True, text=True)

        info_files = glob.glob(os.path.join(wd, "*.info.json"))
        # Subtitle endpoints rate-limit (HTTP 429) when several langs are requested;
        # --ignore-errors lets yt-dlp write what it could. Only hard-fail if nothing landed.
        if not info_files and not pick_sub(wd)[0]:
            sys.stderr.write(r.stderr or "yt-dlp produced no output\n")
            sys.exit(r.returncode or 1)
        info = json.load(open(info_files[0], encoding="utf-8")) if info_files else {}

        sub_path, lang = pick_sub(wd)
        transcript = clean_subs(sub_path) if sub_path else None

        # --- emit markdown ---
        print(f"# {info.get('title', args.url)}")
        meta = [
            f"- channel: {info.get('channel') or info.get('uploader')}",
            f"- url: {info.get('webpage_url', args.url)}",
            f"- duration: {info.get('duration_string') or info.get('duration')}s",
            f"- views: {info.get('view_count')}  likes: {info.get('like_count')}  comments: {info.get('comment_count')}",
            f"- uploaded: {info.get('upload_date')}",
        ]
        print("\n".join(meta))

        desc = (info.get("description") or "").strip()
        if desc:
            print("\n## Description\n")
            print(desc[:1500])

        print("\n## Transcript\n")
        if transcript:
            print(f"_(subtitle lang: {lang})_\n")
            print(transcript)
        else:
            print("_No subtitles available. Fall back to `yt-dlp --list-subs <url>` "
                  "to see what exists, or transcribe the audio._")

        comments = info.get("comments") or []
        if comments:
            print(f"\n## Top {len(comments)} comments (sentiment signal)\n")
            for c in comments:
                likes = c.get("like_count")
                like_str = f" (+{likes})" if likes else ""
                author = c.get("author", "?")
                text = re.sub(r"\s+", " ", (c.get("text") or "")).strip()
                print(f"- **{author}**{like_str}: {text}")


if __name__ == "__main__":
    main()
