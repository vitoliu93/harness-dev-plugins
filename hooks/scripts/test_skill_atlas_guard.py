#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path


HOOK = Path(__file__).with_name("skill-atlas-guard.sh")


class SkillAtlasGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        manifest = self.root / ".claude-plugin" / "plugin.json"
        manifest.parent.mkdir()
        manifest.write_text('{"name":"dev-kit"}\n', encoding="utf-8")
        self.skill = self.root / "skills" / "demo" / "SKILL.md"
        self.skill.parent.mkdir(parents=True)
        self.skill.write_text(
            "---\nname: demo\ndescription: >-\n"
            "  Run a demo.\n  Use when a demo is needed.\n---\n",
            encoding="utf-8",
        )
        self.atlas = self.root / "atlas-state"
        (self.atlas / "atlas").mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def _write_atlas(self, style_count: int, fresh: bool = True) -> None:
        route = self.atlas / "atlas" / "route_overlap_matrix.csv"
        route.write_text("skill_a,skill_b\n", encoding="utf-8")
        report = self.atlas / "skill_atlas.json"
        report.write_text(
            json.dumps(
                {
                    "summary": {
                        "style_issue_count": style_count,
                        "actionable_style_issue_count": 0,
                    }
                }
            ),
            encoding="utf-8",
        )
        stamp = time.time() + (5 if fresh else -5)
        os.utime(route, (stamp, stamp))
        os.utime(report, (stamp, stamp))

    def _run(self) -> str:
        payload = {"cwd": str(self.root), "tool_input": {"command": "git commit -m test"}}
        env = dict(os.environ, SKILL_ATLAS_DIR=str(self.atlas))
        result = subprocess.run(
            ["bash", str(HOOK)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=env,
            check=True,
        )
        return result.stdout

    def test_allows_fresh_clean_atlas(self):
        self._write_atlas(style_count=0)
        self.assertEqual(self._run(), "")

    def test_denies_fresh_atlas_with_style_findings(self):
        self._write_atlas(style_count=2)
        output = self._run()
        self.assertEqual(
            json.loads(output)["hookSpecificOutput"]["permissionDecision"], "deny"
        )
        self.assertIn("Skill & Doc Style", output)

    def test_root_markdown_and_orphan_scripts_trigger_gate(self):
        self.skill.unlink()
        call_site = self.root / "skills" / "demo" / "call-site.md"
        call_site.write_text("runtime guidance\n", encoding="utf-8")
        orphan = self.root / "skills" / "orphan" / "scripts"
        orphan.mkdir(parents=True)
        (orphan / "run.sh").write_text("echo ok\n", encoding="utf-8")
        self._write_atlas(style_count=2)
        output = self._run()
        self.assertEqual(
            json.loads(output)["hookSpecificOutput"]["permissionDecision"], "deny"
        )

    def test_denies_stale_atlas(self):
        self._write_atlas(style_count=0, fresh=False)
        output = self._run()
        self.assertEqual(
            json.loads(output)["hookSpecificOutput"]["permissionDecision"], "deny"
        )

    def test_ignores_non_runtime_changes(self):
        self.skill.unlink()
        (self.root / "README.md").write_text("docs\n", encoding="utf-8")
        self.assertEqual(self._run(), "")


if __name__ == "__main__":
    unittest.main()
