#!/usr/bin/env python3
import shutil
import tempfile
import unittest
from pathlib import Path

import context_sizer


class EstimateTokensTests(unittest.TestCase):
    def test_empty_string_returns_at_least_one(self):
        self.assertEqual(context_sizer.estimate_tokens(""), 1)

    def test_short_known_strings(self):
        self.assertEqual(context_sizer.estimate_tokens("a"), 1)
        self.assertEqual(context_sizer.estimate_tokens("abcd"), 1)
        self.assertEqual(context_sizer.estimate_tokens("abcdefgh"), 2)

    def test_longer_string_follows_len_div_four(self):
        text = "x" * 100
        self.assertEqual(context_sizer.estimate_tokens(text), 25)


class ClassifyTests(unittest.TestCase):
    def test_skill_body(self):
        self.assertEqual(context_sizer.classify(Path("SKILL.md")), "skill_body")

    def test_reference_and_script_kinds(self):
        self.assertEqual(context_sizer.classify(Path("references/guide.md")), "reference")
        self.assertEqual(context_sizer.classify(Path("scripts/run.py")), "script")

    def test_agents_classified_as_interface(self):
        self.assertEqual(context_sizer.classify(Path("agents/helper.md")), "interface")


class SummarizeClassificationTests(unittest.TestCase):
    def setUp(self):
        self.skill_dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.skill_dir)

    def _write(self, rel: str, content: str) -> None:
        path = self.skill_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def test_directory_walk_assigns_expected_kinds(self):
        self._write("SKILL.md", "skill body text")
        self._write("references/notes.md", "reference notes")
        self._write("scripts/tool.py", "print('hi')")

        report = context_sizer.summarize(self.skill_dir)
        kinds = {entry["path"]: entry["kind"] for entry in report["files"]}

        self.assertEqual(kinds["SKILL.md"], "skill_body")
        self.assertEqual(kinds["references/notes.md"], "reference")
        self.assertEqual(kinds["scripts/tool.py"], "script")

    def test_reference_and_script_tokens_count_toward_total_not_initial(self):
        self._write("SKILL.md", "a" * 40)  # 10 tokens
        self._write("references/big.md", "b" * 400)  # 100 tokens
        self._write("scripts/run.py", "c" * 200)  # 50 tokens

        report = context_sizer.summarize(self.skill_dir)

        self.assertEqual(report["estimated_initial_load_tokens"], 10)
        self.assertEqual(report["estimated_total_text_tokens"], 160)


class WarningThresholdTests(unittest.TestCase):
    def setUp(self):
        self.skill_dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.skill_dir)

    def _write(self, rel: str, content: str) -> None:
        path = self.skill_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def test_no_warning_when_initial_load_at_threshold(self):
        # 8000 chars -> 2000 tokens; warning triggers only when > 2000
        self._write("SKILL.md", "x" * 8000)

        report = context_sizer.summarize(self.skill_dir)

        self.assertEqual(report["estimated_initial_load_tokens"], 2000)
        self.assertFalse(report["warning"])

    def test_warning_when_initial_load_exceeds_threshold(self):
        # 8004 chars -> 2001 tokens
        self._write("SKILL.md", "y" * 8004)

        report = context_sizer.summarize(self.skill_dir)

        self.assertEqual(report["estimated_initial_load_tokens"], 2001)
        self.assertTrue(report["warning"])

    def test_agents_tokens_included_in_initial_load_warning(self):
        self._write("SKILL.md", "z" * 40)  # 10 tokens
        self._write("agents/prompt.md", "a" * 8000)  # 2000 tokens

        report = context_sizer.summarize(self.skill_dir)

        self.assertEqual(report["estimated_initial_load_tokens"], 2010)
        self.assertTrue(report["warning"])


if __name__ == "__main__":
    unittest.main()
