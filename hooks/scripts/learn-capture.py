#!/usr/bin/env python3
"""Stop hook: persist [LEARN] markers from the session transcript.

The model emits `[LEARN] <type>: <rule>` inline while working (convention is
injected by session-replay.py at SessionStart). This hook greps the transcript
for those markers and appends new ones to <cwd>/.claude/LEARNED.md — the raw
learning inbox that /debrief later graduates into curated memory.

Pure observer contract: always exit 0, never emit decision/additionalContext
(either would keep the conversation looping). Any failure → exit 0 silently.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

MARKER = re.compile(r"\[LEARN\]\s*([a-z一-鿿-]+)?\s*[::]\s*(.+)", re.IGNORECASE)
HEADER = "# LEARNED — raw inbox (auto-captured by learn-capture hook; graduate via /debrief)\n"


def assistant_texts(transcript: Path):
    with transcript.open() as f:
        for line in f:
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            if o.get("type") != "assistant":
                continue
            content = o.get("message", {}).get("content")
            if isinstance(content, str):
                yield content
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        yield block.get("text", "")


def main():
    payload = json.load(sys.stdin)
    transcript = Path(payload["transcript_path"])
    cwd = Path(payload.get("cwd") or ".")
    if not transcript.is_file():
        return

    found = []
    for text in assistant_texts(transcript):
        for m in MARKER.finditer(text):
            rule = m.group(2).strip().rstrip("`*").strip()
            if rule:
                found.append((m.group(1) or "rule", rule))
    if not found:
        return

    target = cwd / ".claude" / "LEARNED.md"
    existing = target.read_text() if target.is_file() else ""
    new = [(t, r) for t, r in found if r not in existing]
    if not new:
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a") as f:
        if not existing:
            f.write(HEADER)
        for t, r in new:
            f.write(f"- {date.today()} [{t.lower()}] {r}\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
