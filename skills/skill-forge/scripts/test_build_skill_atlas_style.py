#!/usr/bin/env python3
import shutil
import tempfile
import unittest
from datetime import date
import json
from pathlib import Path

from build_skill_atlas import build_atlas


class BuildAtlasStyleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.skills = self.tmp / "skills"
        self.skills.mkdir()
        self.output = self.tmp / "atlas"
        self.report_json = self.tmp / "skill_atlas.json"
        self.report_html = self.tmp / "skill_atlas.html"

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def _skill(self, name: str, description: list[str], body: str = "# Skill\n") -> None:
        skill_dir = self.skills / name
        skill_dir.mkdir()
        lines = ["---", f"name: {name}", "description: >-"]
        lines.extend(f"  {line}" for line in description)
        lines.extend(["---", "", body])
        (skill_dir / "SKILL.md").write_text("\n".join(lines), encoding="utf-8")
        (skill_dir / "manifest.json").write_text(
            json.dumps(
                {
                    "name": name,
                    "owner": "test",
                    "maturity_tier": "incubating",
                    "review_cadence": "monthly",
                    "updated_at": "2026-08-05",
                }
            ),
            encoding="utf-8",
        )

    def _build(self):
        return build_atlas(
            self.skills,
            self.output,
            self.report_html,
            self.report_json,
            0.42,
            date(2026, 8, 5),
        )

    def test_style_issues_are_actionable_atlas_findings(self):
        self._skill(
            "bad",
            ["Run a task.", "Explain its origin.", "Use when the task is needed."],
            body="Run `/Users/example/work/task.py`.\n",
        )
        policy = self.skills / "skill_atlas"
        policy.mkdir()
        (policy / "policy.json").write_text(
            json.dumps(
                {
                    "schema_version": "1",
                    "scope_rules": [
                        {
                            "path_prefix": "bad",
                            "scope": "supporting",
                            "actionable": False,
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        payload = self._build()
        self.assertFalse(payload["ok"])
        self.assertFalse(payload["style_ok"])
        self.assertGreaterEqual(payload["summary"]["style_issue_count"], 2)
        self.assertEqual(payload["summary"]["actionable_style_issue_count"], 0)
        self.assertEqual(payload["actionable_style_issues"], [])
        self.assertTrue((self.output / "style_issues.json").exists())

    def test_clean_style_keeps_atlas_ok(self):
        self._skill(
            "clean",
            ["Run a task.", "Use when the task is needed."],
        )
        payload = self._build()
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["style_ok"])
        self.assertEqual(payload["summary"]["style_issue_count"], 0)
        self.assertEqual(payload["style_issues"], [])


if __name__ == "__main__":
    unittest.main()
