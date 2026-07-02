#!/usr/bin/env python3
"""SessionStart hook: replay recent learned rules + announce the [LEARN] convention.

Plain stdout + exit 0 == injected into Claude's context (canonical for
context-only SessionStart hooks). Reads the last entries of the project's
.claude/LEARNED.md (written by learn-capture.py). Always exits 0.
"""
import json
import sys
from pathlib import Path

MAX_ENTRIES = 5

CONVENTION = (
    "When the user corrects how you work, or you discover a durable project rule "
    "mid-task, emit a single line `[LEARN] <type>: <rule>` in your reply — a Stop "
    "hook persists it to .claude/LEARNED.md; /debrief graduates entries into memory."
)


def main():
    payload = json.load(sys.stdin)
    if payload.get("source") == "compact":
        return  # context survives compaction; don't re-inject
    cwd = Path(payload.get("cwd") or ".")
    learned = cwd / ".claude" / "LEARNED.md"

    print(f"<learn-convention>{CONVENTION}</learn-convention>")
    if learned.is_file():
        entries = [l for l in learned.read_text().splitlines() if l.startswith("- ")]
        if entries:
            print("<learned-rules>")
            print("Recent project rules captured from past sessions (raw inbox, may be ungroomed):")
            for line in entries[-MAX_ENTRIES:]:
                print(line)
            print("</learned-rules>")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
