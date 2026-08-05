#!/usr/bin/env python3
import shutil
import tempfile
import unittest
from pathlib import Path

from skill_style import audit_workspace, find_skill_dirs


class SkillStyleTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.root)

    def _skill(self, name: str, description: list[str], body: str = "# Skill\n") -> Path:
        skill_dir = self.root / name
        skill_dir.mkdir(parents=True)
        lines = ["---", f"name: {name}", "description: >-"]
        lines.extend(f"  {line}" for line in description)
        lines.extend(["---", "", body])
        (skill_dir / "SKILL.md").write_text("\n".join(lines), encoding="utf-8")
        return skill_dir

    def _codes(self) -> list[str]:
        return [issue.code for issue in audit_workspace(self.root)]

    def test_accepts_english_and_chinese_two_line_descriptions(self):
        self._skill(
            "english",
            ["Audit runtime skill contracts.", "Use when reviewing or shipping skill changes."],
        )
        self._skill(
            "chinese",
            ["检查运行时技能契约。", "当创建、优化或发布技能时使用。"],
        )
        self._skill(
            "invoke",
            ["Audit a skill fleet.", "Invoke when a fleet-wide review is required."],
        )
        self._skill(
            "applicable",
            ["审计技能舰队。", "适用于全量技能检查。"],
        )
        self.assertEqual(audit_workspace(self.root), [])

    def test_rejects_description_shape_and_missing_when_line(self):
        self._skill(
            "three-lines",
            ["Create a skill.", "Explain implementation detail.", "Use when authoring skills."],
        )
        self._skill("missing-when", ["Create a skill.", "For skill authors."])
        codes = self._codes()
        self.assertIn("description-two-lines", codes)
        self.assertIn("description-when", codes)

    def test_flags_internal_id_local_path_and_fixed_runtime_id(self):
        skill_dir = self._skill(
            "bad-runtime",
            ["Run an operation.", "Use when the operation is required."],
        )
        reference = skill_dir / "references" / "guide.md"
        reference.parent.mkdir()
        reference.write_text(
            "Task IJAB12 failed.\n"
            "Run `/Users/example/codebase/tool.py` after that.\n"
            "Set workspace_id=12345678-1234-1234-1234-123456789abc.\n",
            encoding="utf-8",
        )
        codes = self._codes()
        self.assertIn("internal-ticket", codes)
        self.assertIn("local-path", codes)
        self.assertIn("fixed-runtime-id", codes)

    def test_flags_prose_wall_and_fixed_sibling_skill_path(self):
        skill_dir = self._skill(
            "wall",
            ["Run a compact workflow.", "Use when a compact workflow is needed."],
            body="This " + ("very long runtime instruction " * 20),
        )
        script = skill_dir / "scripts" / "run.sh"
        script.parent.mkdir()
        script.write_text(
            'python3 "${CLAUDE_SKILL_DIR}/../other-skill/scripts/run.py"\n',
            encoding="utf-8",
        )
        codes = self._codes()
        self.assertIn("prose-wall", codes)
        self.assertIn("local-path", codes)

    def test_leaves_semantic_narrative_and_marketing_judgment_to_llm_review(self):
        skill_dir = self._skill(
            "extra-docs",
            ["Run a documented workflow.", "Use when the workflow is needed."],
        )
        (skill_dir / "call-site.md").write_text("历史教训：不要这样做。\n", encoding="utf-8")
        scripts = skill_dir / "scripts"
        scripts.mkdir()
        (scripts / "guide.md").write_text("Use this 一站式 command.\n", encoding="utf-8")
        self.assertEqual(self._codes(), [])

    def test_flags_user_path_without_trailing_slash(self):
        skill_dir = self._skill(
            "short-path",
            ["Run a portable workflow.", "Use when portability matters."],
        )
        (skill_dir / "run.sh").write_text("cd /Users/example\n", encoding="utf-8")
        reference = skill_dir / "references" / "command.md"
        reference.parent.mkdir()
        reference.write_text(
            "```bash\ncd /Users/other # developer shortcut\n```\n",
            encoding="utf-8",
        )
        self.assertIn("local-path", self._codes())

    def test_skips_frontmatter_for_prose_wall_checks(self):
        skill_dir = self.root / "frontmatter"
        skill_dir.mkdir()
        skill_dir.joinpath("SKILL.md").write_text(
            "---\nname: frontmatter\ndescription: >-\n"
            "  Run a workflow.\n  Use when the workflow is needed.\n"
            f"metadata: {'x' * 400}\n---\n\n# Skill\n",
            encoding="utf-8",
        )
        self.assertNotIn("prose-wall", self._codes())

    def test_flags_orphan_runtime_surface(self):
        orphan = self.root / "orphan" / "scripts"
        orphan.mkdir(parents=True)
        (orphan / "run.sh").write_text("echo ok\n", encoding="utf-8")
        nested_skill = self.root / "mixed" / "child"
        nested_skill.mkdir(parents=True)
        nested_skill.joinpath("SKILL.md").write_text(
            "---\nname: child\ndescription: >-\n"
            "  Run a child workflow.\n  Use when the child workflow is needed.\n---\n",
            encoding="utf-8",
        )
        mixed_scripts = self.root / "mixed" / "scripts"
        mixed_scripts.mkdir()
        (mixed_scripts / "run.sh").write_text("echo mixed\n", encoding="utf-8")
        evals = self.root / "eval-only" / "evals"
        evals.mkdir(parents=True)
        (evals / "trigger_cases.json").write_text("{}\n", encoding="utf-8")
        self.assertGreaterEqual(self._codes().count("missing-skill"), 3)

    def test_allows_reasoned_same_line_exception(self):
        skill_dir = self._skill(
            "exception",
            ["Document a negative example.", "Use when explaining a rejected pattern."],
        )
        reference = skill_dir / "references" / "negative.md"
        reference.parent.mkdir()
        reference.write_text(
            "```bash\n"
            "cd /Users/example # style-lint: allow local-path -- negative example only\n"
            "```\n",
            encoding="utf-8",
        )
        self.assertEqual(audit_workspace(self.root), [])

    def test_rejects_unreasoned_or_wildcard_exception(self):
        skill_dir = self._skill(
            "bad-exception",
            ["Document rejected patterns.", "Use when explaining rejected patterns."],
        )
        reference = skill_dir / "references" / "negative.md"
        reference.parent.mkdir()
        reference.write_text(
            "cd /Users/example # style-lint: allow local-path\n"
            "cd /Users/other # style-lint: allow * -- too broad\n",
            encoding="utf-8",
        )
        issues = [
            issue for issue in audit_workspace(self.root) if issue.code == "local-path"
        ]
        self.assertEqual(len(issues), 2)

    def test_ignores_eval_fixtures_and_archived_skills(self):
        skill_dir = self._skill(
            "clean",
            ["Run a clean workflow.", "Use when the clean workflow is needed."],
        )
        evals = skill_dir / "evals"
        evals.mkdir()
        (evals / "trigger_cases.json").write_text(
            '{"prompt": "复盘历史教训 IJAB12"}\n', encoding="utf-8"
        )
        archived = self.root / "_archive" / "old"
        archived.mkdir(parents=True)
        (archived / "SKILL.md").write_text("not valid", encoding="utf-8")
        self.assertEqual(find_skill_dirs(self.root), [skill_dir])
        self.assertEqual(audit_workspace(self.root), [])

    def test_accepts_configurable_and_standard_tool_paths(self):
        skill_dir = self._skill(
            "portable",
            ["Run a portable workflow.", "Use when portable execution is required."],
        )
        reference = skill_dir / "references" / "paths.md"
        reference.parent.mkdir()
        reference.write_text(
            "Use `${CLAUDE_PLUGIN_ROOT}/skills/portable/scripts/run.py`.\n"
            "Set `CACHE=${CACHE_DIR:-$HOME/.cache/portable}`.\n",
            encoding="utf-8",
        )
        self.assertEqual(audit_workspace(self.root), [])


if __name__ == "__main__":
    unittest.main()
