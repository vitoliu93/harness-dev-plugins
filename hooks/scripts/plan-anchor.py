#!/usr/bin/env python3
"""SessionStart(source=compact) hook: re-inject the plan's non-negotiables.

Compaction summarises what *happened*; it reliably drops what must *stay true*
— the reference source of truth, the done-means, the out-of-scope list. Those
live in goal.md, which is immutable by contract, so it is the right anchor to
replay verbatim after every compaction.

PreCompact cannot inject context (documented: no additionalContext, stdout is
debug-log only), so this rides SessionStart with source == "compact", where
plain stdout reaches Claude. Always exits 0; silent when there is no live plan.
"""
import json
import subprocess
import sys
from pathlib import Path

MAX_PLANS = 2
MAX_CHARS = 1600
SECTIONS = ("参考真源", "Reference source", "Done means", "Explicitly out of scope")


def find_goals(cwd: Path):
    """Un-archived goal.md files at or under cwd (plan dirs live with the code)."""
    try:
        out = subprocess.run(
            ["find", str(cwd), "-maxdepth", "5", "-path", "*/docs/advanced-plans/*",
             "-name", "goal.md", "-not", "-path", "*/_archive/*"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except Exception:
        return []
    paths = [Path(p) for p in out.splitlines() if p.strip()]
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)[:MAX_PLANS]


def sections_of(text: str):
    """Keep only the sections that carry constraints, drop the narrative."""
    keep, on = [], False
    for line in text.splitlines():
        if line.startswith("## "):
            on = any(s.lower() in line.lower() for s in SECTIONS)
        if on:
            keep.append(line)
    return "\n".join(keep).strip()


def main():
    payload = json.load(sys.stdin)
    if payload.get("source") != "compact":
        return
    cwd = Path(payload.get("cwd") or ".")
    goals = find_goals(cwd)
    if not goals:
        return

    print("<plan-anchor>")
    print("Context was just compacted. These constraints are NOT summaries — they are "
          "the locked plan and outrank anything the summary implies. Re-read the "
          "reference source before the next phase if you are about to build against it.")
    for g in goals:
        body = sections_of(g.read_text(errors="replace"))[:MAX_CHARS]
        if not body:
            continue
        print(f"\n### {g.parent.name} ({g})")
        print(body)
        proto = g.parent / "prototype.html"
        if proto.is_file():
            print(f"\n**目标原型(已批准的验收参照物)**: {proto}")
    print("</plan-anchor>")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
