#!/usr/bin/env python3
"""Report skill usage after folding renamed and namespaced identities."""

import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path


DEFAULT_DB = Path.home() / ".claude" / "observability" / "obs.db"
DEFAULT_ALIASES = Path(__file__).resolve().parents[2] / "skill-atlas" / "aliases.json"


def load_identity_map(path: Path) -> tuple[dict[str, str], dict[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("aliases", {}), data.get("namespace_folds", {})


def canonical_skill(
    raw: str, aliases: dict[str, str], namespace_folds: dict[str, str]
) -> str:
    skill = raw
    for old, new in namespace_folds.items():
        if old.startswith("_"):
            continue
        if skill.startswith(old):
            skill = new + skill[len(old):]
            break

    if skill in aliases:
        return aliases[skill]

    base = skill.rsplit(":", 1)[-1]
    if base in aliases:
        return aliases[base]
    if skill.startswith("dev-kit:"):
        return base
    return skill


def collect_usage(
    db: Path,
    aliases: dict[str, str],
    namespace_folds: dict[str, str],
    since: str | None,
    days: int,
) -> list[dict]:
    predicate = "tc.ts >= ?" if since else "tc.ts >= datetime('now', ?)"
    value = since or f"-{days} days"
    query = f"""
        SELECT s.source, tc.session_id, tc.skill, tc.ts
        FROM tool_calls tc
        JOIN sessions s ON s.session_id = tc.session_id
        WHERE tc.tool IN ('Skill', 'SlashCommand')
          AND tc.skill IS NOT NULL
          AND {predicate}
    """

    grouped: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"calls": 0, "sessions": set(), "last_used": None}
    )
    with sqlite3.connect(db) as conn:
        for source, session_id, raw_skill, ts in conn.execute(query, (value,)):
            skill = canonical_skill(raw_skill, aliases, namespace_folds)
            item = grouped[(source, skill)]
            item["calls"] += 1
            item["sessions"].add(session_id)
            item["last_used"] = max(item["last_used"] or ts, ts)

    rows = [
        {
            "source": source,
            "skill": skill,
            "calls": item["calls"],
            "sessions": len(item["sessions"]),
            "last_used": item["last_used"],
        }
        for (source, skill), item in grouped.items()
    ]
    return sorted(rows, key=lambda row: (-row["calls"], row["skill"], row["source"]))


def print_table(rows: list[dict]) -> None:
    columns = ("source", "skill", "calls", "sessions", "last_used")
    widths = {
        column: max(len(column), *(len(str(row[column])) for row in rows))
        for column in columns
    }
    print("  ".join(column.ljust(widths[column]) for column in columns))
    for row in rows:
        print("  ".join(str(row[column]).ljust(widths[column]) for column in columns))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aggregate obs.db skill usage through aliases.json."
    )
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--aliases", type=Path, default=DEFAULT_ALIASES)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--since", help="ISO timestamp; overrides --days")
    parser.add_argument("--skill", help="Show one canonical skill identity")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    aliases, namespace_folds = load_identity_map(args.aliases)
    rows = collect_usage(args.db, aliases, namespace_folds, args.since, args.days)
    if args.skill:
        target = canonical_skill(args.skill, aliases, namespace_folds)
        rows = [row for row in rows if row["skill"] == target]

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_table(rows)


if __name__ == "__main__":
    main()
