#!/usr/bin/env python3
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skill_usage import canonical_skill, collect_usage


ALIASES = {
    "report": "no-ai-slop",
    "campaign": "kox-agent-plugins:ship",
    "ship": "kox-agent-plugins:ship",
}
NAMESPACE_FOLDS = {"vito-agent-plugins:": "dev-kit:"}


class TestCanonicalSkill(unittest.TestCase):
    def test_folds_bare_and_namespaced_aliases(self):
        self.assertEqual(
            canonical_skill("report", ALIASES, NAMESPACE_FOLDS), "no-ai-slop"
        )
        self.assertEqual(
            canonical_skill("dev-kit:report", ALIASES, NAMESPACE_FOLDS),
            "no-ai-slop",
        )
        self.assertEqual(
            canonical_skill("dev-kit:campaign", ALIASES, NAMESPACE_FOLDS),
            "kox-agent-plugins:ship",
        )

    def test_folds_old_plugin_namespace(self):
        self.assertEqual(
            canonical_skill(
                "vito-agent-plugins:no-ai-slop", ALIASES, NAMESPACE_FOLDS
            ),
            "no-ai-slop",
        )

    def test_preserves_external_canonical_target(self):
        self.assertEqual(
            canonical_skill("campaign", ALIASES, NAMESPACE_FOLDS),
            "kox-agent-plugins:ship",
        )
        self.assertEqual(
            canonical_skill("kox-agent-plugins:ship", ALIASES, NAMESPACE_FOLDS),
            "kox-agent-plugins:ship",
        )


class TestCollectUsage(unittest.TestCase):
    def test_aggregates_aliases_without_merging_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "obs.db"
            with sqlite3.connect(db) as conn:
                conn.executescript(
                    """
                    CREATE TABLE sessions (session_id TEXT PRIMARY KEY, source TEXT);
                    CREATE TABLE tool_calls (
                      session_id TEXT, tool TEXT, skill TEXT, ts TEXT
                    );
                    INSERT INTO sessions VALUES ('s1', 'claude-code');
                    INSERT INTO sessions VALUES ('s2', 'cursor-ide');
                    INSERT INTO tool_calls VALUES
                      ('s1', 'Skill', 'report', '2026-08-01T10:00:00Z'),
                      ('s1', 'Skill', 'dev-kit:no-ai-slop', '2026-08-02T10:00:00Z'),
                      ('s2', 'SlashCommand', 'dev-kit:report', '2026-08-03T10:00:00Z');
                    """
                )

            rows = collect_usage(
                db, ALIASES, NAMESPACE_FOLDS, "2026-01-01T00:00:00Z", 30
            )
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["source"], "claude-code")
            self.assertEqual(rows[0]["skill"], "no-ai-slop")
            self.assertEqual(rows[0]["calls"], 2)
            self.assertEqual(rows[0]["sessions"], 1)
            self.assertEqual(rows[1]["source"], "cursor-ide")
            self.assertEqual(rows[1]["calls"], 1)


if __name__ == "__main__":
    unittest.main()
