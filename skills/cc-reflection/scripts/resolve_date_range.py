#!/usr/bin/env python3
"""Resolve a human date range expression to UTC ISO boundaries.

Usage:
    resolve_date_range.py [EXPR]

EXPR examples (case-insensitive, EN/ZH):
    (empty)                 today, or recent-24h if local hour < 4 (early-morning auto-switch)
    today | 今天                            explicit calendar today (no auto-switch)
    yesterday | 昨天
    recent-24h | last 24 hours | 近 24 小时   rolling 24h ending now
    last week | recent week | 上周 | 本周 | 最近一周
    last N days | recent N days | 近 N 天 | 最近 N 天
    2026-05-27                          single day
    2026-05-20..2026-05-27              inclusive range (`..` or `:`)

Output (single line, tab-separated):
    <start_utc_iso>\t<end_utc_iso>\t<label>

start is inclusive, end is exclusive (end = next-day 00:00 local).
Boundaries are computed in the system local timezone, then converted to UTC.
"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone


def local_tz():
    return datetime.now().astimezone().tzinfo


def local_midnight(d: datetime) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=local_tz())


def fmt(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def resolve(expr: str) -> tuple[datetime, datetime, str]:
    e = expr.strip().lower()
    now = datetime.now(tz=local_tz())
    today = local_midnight(now)

    if e == "":
        # Empty arg = caller wants the natural default. Calling at 00:45 with
        # calendar "today" produces a near-empty window (23h+ in the future).
        # Auto-switch to rolling-24h before 04:00; otherwise treat as today.
        if now.hour < 4:
            return now - timedelta(hours=24), now, f"recent-24h-{now.strftime('%Y-%m-%d')}"
        return today, today + timedelta(days=1), "today"

    if e in ("today", "今天"):
        return today, today + timedelta(days=1), "today"

    if e in ("recent-24h", "recent 24 hours", "last 24 hours", "近 24 小时", "近24小时", "最近 24 小时", "最近24小时"):
        return now - timedelta(hours=24), now, f"recent-24h-{now.strftime('%Y-%m-%d')}"

    if e in ("yesterday", "昨天"):
        return today - timedelta(days=1), today, "yesterday"

    if e in ("last week", "recent week", "this week", "上周", "本周", "最近一周", "近一周"):
        return today - timedelta(days=6), today + timedelta(days=1), "last-7-days"

    m = re.fullmatch(r"(?:last|recent|近|最近)\s*(\d+)\s*(?:days?|天)", e)
    if m:
        n = int(m.group(1))
        if n < 1:
            raise ValueError(f"day count must be >= 1, got {n}")
        return today - timedelta(days=n - 1), today + timedelta(days=1), f"last-{n}-days"

    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})(?:\.\.|:)(\d{4}-\d{2}-\d{2})", e)
    if m:
        start = local_midnight(datetime.strptime(m.group(1), "%Y-%m-%d"))
        end_inclusive = local_midnight(datetime.strptime(m.group(2), "%Y-%m-%d"))
        if end_inclusive < start:
            raise ValueError(f"range end {m.group(2)} is before start {m.group(1)}")
        return start, end_inclusive + timedelta(days=1), f"{m.group(1)}_to_{m.group(2)}"

    m = re.fullmatch(r"\d{4}-\d{2}-\d{2}", e)
    if m:
        d = local_midnight(datetime.strptime(e, "%Y-%m-%d"))
        return d, d + timedelta(days=1), e

    raise ValueError(f"unrecognized date expression: {expr!r}")


def main(argv: list[str]) -> int:
    expr = " ".join(argv[1:]) if len(argv) > 1 else ""
    try:
        start, end, label = resolve(expr)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"{fmt(start)}\t{fmt(end)}\t{label}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
