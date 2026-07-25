#!/usr/bin/env python3
"""PostCompact hook: record what each compaction dropped.

The expensive lesson: over one 38-hour task the context was compacted 8 times
and the design source's path appeared in **zero** of the 8 summaries — the
half-life of a reference source is one compaction. That was only discovered by
digging through the transcript weeks later. This makes it a fact on disk at the
moment it happens.

Deliberately **no model call**. Anchors are concrete strings (a path, a plan
slug, an issue ident); "is it in the summary" is a substring test, and a hook
must be fast and unable to fail. Semantic questions ("what *else* got lost")
belong at debrief time, over the accumulated ledger, on ccobs's cheap engine —
not inline here.

PostCompact has no decision control (documented) — this only observes.
Ledger: ~/.claude/observability/compaction.jsonl  (+ full summaries alongside)
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

OBS = Path(os.environ.get("CCOBS_DIR", Path.home() / ".claude" / "observability"))
LEDGER = OBS / "compaction.jsonl"
SUMMARIES = OBS / "compactions"
SECTIONS = ("参考真源", "Reference source", "Done means")


def live_goals(cwd: Path):
    try:
        out = subprocess.run(
            ["find", str(cwd), "-maxdepth", "5", "-path", "*/docs/advanced-plans/*",
             "-name", "goal.md", "-not", "-path", "*/_archive/*"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except Exception:
        return []
    paths = [Path(p) for p in out.splitlines() if p.strip()]
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)[:2]


def anchors_of(goal: Path):
    """Concrete strings whose absence from a summary is a real loss."""
    found, on = [], False
    for line in goal.read_text(errors="replace").splitlines():
        if line.startswith("## "):
            on = any(s.lower() in line.lower() for s in SECTIONS)
            continue
        if not on:
            continue
        # in-repo paths and idents are the checkable atoms; prose is not
        found += re.findall(r"[\w./-]+\.(?:html|md|json|yaml|png|pdf)", line)
        found += re.findall(r"\b[A-Z]{2}[A-Z0-9]{4}\b", line)
    found.append(goal.parent.name)                       # the plan slug itself
    if (goal.parent / "prototype.html").is_file():
        found.append("prototype.html")
    return sorted({f for f in found if len(f) > 3})


def main():
    payload = json.load(sys.stdin)
    summary = payload.get("compact_summary") or ""
    cwd = Path(payload.get("cwd") or ".")
    sid = payload.get("session_id") or "unknown"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    goals = live_goals(cwd)
    if not goals and not summary:
        return                                            # nothing to say

    SUMMARIES.mkdir(parents=True, exist_ok=True)
    stamp = now.replace(":", "").replace("-", "")
    dump = SUMMARIES / f"{sid}-{stamp}.md"
    if summary:
        dump.write_text(summary)

    def kept(a):  # a bare filename in the summary still counts as carried over
        return a in summary or Path(a).name in summary

    plans = []
    for g in goals:
        anchors = anchors_of(g)
        plans.append({
            "goal": str(g),
            "dropped": [a for a in anchors if not kept(a)],
            "survived": [a for a in anchors if kept(a)],
        })

    row = {
        "ts": now,
        "session_id": sid,
        "trigger": payload.get("trigger"),
        "cwd": str(cwd),
        "summary_chars": len(summary),
        "summary_file": str(dump) if summary else None,
        "plans": plans,
    }
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
