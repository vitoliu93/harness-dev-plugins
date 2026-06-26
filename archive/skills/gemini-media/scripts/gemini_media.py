#!/usr/bin/env python3
"""Understand an audio/video file with Gemini Flash-Lite — the no-subtitle fallback.

When a video has no usable subtitles, download its audio (cheap, ~32 tok/s) or a
low-res video (richer: reads on-screen slides/demos, ~258 tok/s) and pass it here.
Gemini transcribes + summarizes in one shot. Dependency-free: talks to the Gemini
File API over stdlib urllib, honoring GEMINI_API_KEY and GEMINI_BASE_URL.

Designed to be run by a content-understanding subagent so the media and raw
transcript never touch the main window — only the returned digest does.

Usage:
    gemini_media.py <file> [--audio-only] [--question "..."] [--model gemini-3.1-flash-lite]

    --audio-only   transcode to 16k mono mp3 first (cheap path, ~8x fewer tokens
                   than video, and makes any container — m4a/opus/webm — accepted)
    --question Q   focus the digest on the user's question (optional)
    --model M      Gemini model id (default gemini-3.1-flash-lite; the cheaper
                   gemini-2.5-flash-lite also works)
    --prompt P     fully override the instruction sent to Gemini
"""
import argparse
import json
import mimetypes
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

MIME = {".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
        ".aac": "audio/aac", ".ogg": "audio/ogg", ".opus": "audio/ogg",
        ".flac": "audio/flac", ".mp4": "video/mp4", ".webm": "video/webm",
        ".mkv": "video/x-matroska", ".mov": "video/quicktime"}

DEFAULT_PROMPT = (
    "Transcribe and understand this media. Return a structured digest:\n"
    "- a one-line topic summary\n"
    "- the key points in order (with any specific facts, numbers, steps, commands)\n"
    "- the overall takeaway\n"
    "Respond in the dominant spoken language of the content. Be faithful to what is "
    "actually said/shown — do not invent."
)


def api(base, key):
    base = base.rstrip("/")
    upload = base.replace("/v1beta", "/upload/v1beta") + "/files"
    return base, upload


def req(url, data=None, headers=None, method="GET"):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"HTTP {e.code} on {method} {url}\n{e.read().decode(errors='ignore')}\n")
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--audio-only", action="store_true")
    ap.add_argument("--question", default=None)
    ap.add_argument("--model", default="gemini-3.1-flash-lite")
    ap.add_argument("--prompt", default=None)
    args = ap.parse_args()

    key = os.environ["GEMINI_API_KEY"]
    base, upload_url = api(os.environ.get("GEMINI_BASE_URL",
                           "https://generativelanguage.googleapis.com/v1beta"), key)
    auth = {"x-goog-api-key": key}

    # --audio-only: transcode any container to a Gemini-supported 16k mono mp3.
    # Downloads commonly arrive as opus-in-webm or m4a (audio/mp4), which the
    # audio endpoint rejects; this also strips video for the ~8x cheaper path.
    tmp = None
    path = args.file
    if args.audio_only:
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
        subprocess.run(["ffmpeg", "-y", "-i", args.file, "-vn", "-ac", "1",
                        "-ar", "16000", "-c:a", "libmp3lame", tmp],
                       check=True, capture_output=True)
        path = tmp

    size = os.path.getsize(path)
    ext = os.path.splitext(path)[1].lower()
    mime = MIME.get(ext) or mimetypes.guess_type(path)[0] or "application/octet-stream"

    # 1. start resumable upload session
    _, h, _ = req(upload_url,
                  data=json.dumps({"file": {"display_name": os.path.basename(path)}}).encode(),
                  headers={**auth, "X-Goog-Upload-Protocol": "resumable",
                           "X-Goog-Upload-Command": "start",
                           "X-Goog-Upload-Header-Content-Length": str(size),
                           "X-Goog-Upload-Header-Content-Type": mime,
                           "Content-Type": "application/json"},
                  method="POST")
    session = h.get("X-Goog-Upload-URL") or h.get("x-goog-upload-url")

    # 2. upload bytes + finalize
    _, _, body = req(session, data=open(path, "rb").read(),
                     headers={**auth, "Content-Length": str(size), "X-Goog-Upload-Offset": "0",
                              "X-Goog-Upload-Command": "upload, finalize"},
                     method="POST")
    if tmp:
        os.remove(tmp)
    f = json.loads(body)["file"]
    name, uri, state = f["name"], f["uri"], f.get("state")

    # 3. wait for ACTIVE (video/audio is processed server-side)
    waited = 0
    while state == "PROCESSING" and waited < 300:
        time.sleep(3); waited += 3
        _, _, body = req(f"{base}/{name}", headers=auth)
        state = json.loads(body).get("state")
    if state != "ACTIVE":
        sys.stderr.write(f"file did not become ACTIVE (state={state})\n")
        sys.exit(1)

    # 4. generate
    instruction = args.prompt or DEFAULT_PROMPT
    if args.question:
        instruction = f'Focus on answering: "{args.question}".\n\n' + instruction
    payload = {"contents": [{"parts": [
        {"file_data": {"mime_type": mime, "file_uri": uri}},
        {"text": instruction}]}]}
    _, _, body = req(f"{base}/models/{args.model}:generateContent",
                     data=json.dumps(payload).encode(),
                     headers={**auth, "Content-Type": "application/json"}, method="POST")
    resp = json.loads(body)
    try:
        text = "".join(p.get("text", "") for p in resp["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError):
        sys.stderr.write("unexpected response:\n" + json.dumps(resp, ensure_ascii=False)[:1000] + "\n")
        sys.exit(1)
    usage = resp.get("usageMetadata", {})
    print(text.strip())
    print(f"\n---\n_(via {args.model}, {usage.get('totalTokenCount','?')} tokens)_", file=sys.stderr)


if __name__ == "__main__":
    main()
