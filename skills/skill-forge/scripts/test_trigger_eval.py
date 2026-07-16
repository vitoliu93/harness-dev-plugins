#!/usr/bin/env python3
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trigger_eval import (
    normalize,
    words,
    phrase_present,
    collect_concept_hits,
    lexical_support,
    desired_positive_concepts,
    score_prompt_semantic,
    evaluate,
    compare_reports,
    iter_case_items,
    extract_description,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class TestNormalize(unittest.TestCase):
    """normalize(): lowercase, strip non-word/CJK, collapse whitespace."""

    def test_lowercase(self):
        self.assertEqual(normalize("Hello World"), "hello world")

    def test_strips_non_word_chars(self):
        self.assertEqual(normalize("hello, world! test."), "hello world test")

    def test_collapses_whitespace(self):
        self.assertEqual(normalize("hello   world"), "hello world")

    def test_retains_cjk(self):
        self.assertEqual(normalize("hello 世界"), "hello 世界")

    def test_strips_outer_whitespace(self):
        self.assertEqual(normalize("  hello  "), "hello")


class TestWords(unittest.TestCase):
    """words(): token extraction via WORD_RE."""

    def test_basic(self):
        self.assertEqual(words("hello world"), {"hello", "world"})

    def test_cjk(self):
        self.assertEqual(words("hello 世界"), {"hello", "世界"})

    def test_punctuation_dropped(self):
        self.assertEqual(words("hello, world!"), {"hello", "world"})

    def test_deduplicates(self):
        self.assertEqual(words("hello hello"), {"hello"})


class TestPhrasePresent(unittest.TestCase):
    """phrase_present(): exact / whole-word / substring matching."""

    def test_latin_whole_word(self):
        self.assertTrue(phrase_present("build the system", "build"))

    def test_latin_no_substring(self):
        """Latin phrase must be a whole word (not substring of another word)."""
        self.assertFalse(phrase_present("my builds", "build"))

    def test_cjk_substring_ok(self):
        self.assertTrue(phrase_present("测试系统构建", "系统构"))

    def test_empty_phrase(self):
        self.assertFalse(phrase_present("anything", ""))

    def test_normalized_text_latin(self):
        """Works with pre-normalized (lowercased) text — as callers provide."""
        self.assertTrue(phrase_present("build system", "build"))

    def test_not_present(self):
        self.assertFalse(phrase_present("hello world", "build"))


class TestCollectConceptHits(unittest.TestCase):
    """collect_concept_hits(): matching concepts against text."""

    def test_single_match(self):
        concepts = {"build": {"weight": 0.6, "phrases": ["build", "compile"]}}
        hits = collect_concept_hits("build the system", concepts)
        self.assertIn("build", hits)
        self.assertEqual(hits["build"]["weight"], 0.6)
        self.assertIn("build", hits["build"]["matched_phrases"])

    def test_multiple_matches(self):
        concepts = {
            "build": {"weight": 0.6, "phrases": ["build"]},
            "docs": {"weight": 0.4, "phrases": ["documentation"]},
        }
        hits = collect_concept_hits("build the documentation", concepts)
        self.assertIn("build", hits)
        self.assertIn("docs", hits)

    def test_no_match(self):
        hits = collect_concept_hits("hello world",
                                    {"build": {"weight": 1.0, "phrases": ["build"]}})
        self.assertEqual(hits, {})

    def test_exclusive_flag_preserved(self):
        concepts = {
            "no_code": {"weight": 0.4, "phrases": ["no code"], "exclusive": True},
        }
        hits = collect_concept_hits("write no code", concepts)
        self.assertTrue(hits["no_code"]["exclusive"])


class TestLexicalSupport(unittest.TestCase):
    """lexical_support(): word-overlap ratio."""

    def test_full_overlap(self):
        self.assertEqual(lexical_support({"build", "system"}, "build system"), 1.0)

    def test_partial_overlap(self):
        self.assertAlmostEqual(lexical_support({"build", "system", "test"},
                                               "build fast"), 0.5)

    def test_no_overlap(self):
        self.assertEqual(lexical_support({"a", "b"}, "c d"), 0.0)

    def test_empty_prompt(self):
        self.assertEqual(lexical_support({"a"}, ""), 0.0)


class TestDesiredPositiveConcepts(unittest.TestCase):
    """desired_positive_concepts(): concept selection from description."""

    def test_selects_from_description(self):
        config = {
            "positive_concepts": {
                "build": {"weight": 0.6, "phrases": ["build"]},
                "test": {"weight": 0.4, "phrases": ["test"]},
            },
            "fallback_positive_concepts": [],
        }
        self.assertEqual(desired_positive_concepts("build this", config),
                         ["build"])

    def test_fallback_when_no_match(self):
        config = {
            "positive_concepts": {
                "build": {"weight": 0.6, "phrases": ["build"]},
            },
            "fallback_positive_concepts": ["generic"],
        }
        self.assertEqual(desired_positive_concepts("something else", config),
                         ["generic"])

    def test_empty_fallback_returns_empty(self):
        config = {
            "positive_concepts": {},
            "fallback_positive_concepts": [],
        }
        self.assertEqual(desired_positive_concepts("anything", config), [])


class TestScorePromptSemantic(unittest.TestCase):
    """score_prompt_semantic(): core scoring logic."""

    @staticmethod
    def _base_config(**overrides):
        cfg = {
            "positive_concepts": {
                "build": {"weight": 0.6, "phrases": ["build", "compile"]},
                "test": {"weight": 0.4, "phrases": ["test", "verify"]},
            },
            "negative_concepts": {},
            "fallback_positive_concepts": [],
        }
        cfg.update(overrides)
        return cfg

    # -- desired-concept selection from description --

    def test_desired_concept_picked_from_description(self):
        """Only concepts matching the description become 'desired'."""
        _, detail = score_prompt_semantic(
            "build the system", "build it", self._base_config())
        self.assertEqual(detail["desired_positive_concepts"], ["build"])

    # -- coverage math: single vs multiple matched concepts --

    def test_single_desired_concept_matched_full_coverage(self):
        """One desired concept matched → coverage = 1.0, no boost."""
        _, detail = score_prompt_semantic(
            "build the system", "please build and compile",
            self._base_config())
        self.assertEqual(detail["matched_desired_concepts"], ["build"])
        self.assertEqual(detail["semantic_coverage"], 1.0)
        self.assertEqual(detail["coverage_boost"], 0.0)

    def test_single_matched_partial_coverage(self):
        """Desired concept not in prompt → coverage < 1.0."""
        _, detail = score_prompt_semantic(
            "build and test", "build the system", self._base_config())
        # desired = ["build", "test"], only "build" matched
        self.assertEqual(detail["matched_desired_concepts"], ["build"])
        self.assertAlmostEqual(detail["semantic_coverage"], 0.6)  # 0.6 / 1.0
        self.assertEqual(detail["coverage_boost"], 0.0)

    def test_two_matched_desired_boost_004(self):
        """Two desired concepts matched → coverage_boost = 0.04."""
        _, detail = score_prompt_semantic(
            "build and test", "build the test suite", self._base_config())
        self.assertEqual(len(detail["matched_desired_concepts"]), 2)
        self.assertEqual(detail["coverage_boost"], 0.04)

    def test_three_matched_desired_boost_006(self):
        """Three desired concepts matched → coverage_boost = 0.04 + 0.02."""
        cfg = self._base_config(
            positive_concepts={
                "a": {"weight": 0.3, "phrases": ["alpha"]},
                "b": {"weight": 0.4, "phrases": ["bravo"]},
                "c": {"weight": 0.3, "phrases": ["charlie"]},
            },
        )
        _, detail = score_prompt_semantic(
            "alpha bravo charlie", "alpha bravo charlie", cfg)
        self.assertEqual(len(detail["matched_desired_concepts"]), 3)
        self.assertEqual(detail["coverage_boost"], 0.06)

    # -- negative-concept penalty --

    def test_negative_penalty_applied(self):
        """Negative concept matched → score reduced by its weight."""
        cfg = self._base_config(
            negative_concepts={
                "summary": {"weight": 0.25, "phrases": ["summarize"]},
            },
        )
        score, detail = score_prompt_semantic(
            "build the system", "build and summarize", cfg)
        self.assertIn("summary", detail["matched_negative_concepts"])
        self.assertEqual(detail["negative_penalty"], 0.25)
        # score should be lower than without the penalty
        score_clean, _ = score_prompt_semantic(
            "build the system", "build only", cfg)
        self.assertLess(score, score_clean)

    # -- exclusive-negative behavior --

    def test_exclusive_negative_low_coverage_extra_penalty(self):
        """Exclusive negative + semantic_coverage < 0.9 → extra 0.15 penalty."""
        cfg = {
            "positive_concepts": {
                "build": {"weight": 0.5, "phrases": ["build"]},
                "refactor": {"weight": 0.5, "phrases": ["refactor"]},
            },
            "negative_concepts": {
                "no_code": {"weight": 0.3, "phrases": ["no code"],
                            "exclusive": True},
            },
            "fallback_positive_concepts": [],
        }
        # description hits build+refactor; prompt only matches build + no_code
        # → coverage = 0.5, exclusive_negative active, extra 0.15 penalty
        score, detail = score_prompt_semantic(
            "build and refactor", "build no code ever", cfg)
        self.assertEqual(detail["exclusive_negative_concepts"], ["no_code"])
        self.assertAlmostEqual(detail["semantic_coverage"], 0.5)
        # score should be well below what just the normal negative penalty gives
        self.assertLess(score, 0.3)

    def test_exclusive_negative_high_coverage_no_extra(self):
        """Exclusive negative but coverage >= 0.9 → no extra penalty."""
        cfg = {
            "positive_concepts": {
                "build": {"weight": 1.0, "phrases": ["build"]},
            },
            "negative_concepts": {
                "avoid": {"weight": 0.2, "phrases": ["don't"],
                          "exclusive": True},
            },
            "fallback_positive_concepts": [],
        }
        score, detail = score_prompt_semantic(
            "build the system", "build don't do that", cfg)
        self.assertIn("avoid", detail["exclusive_negative_concepts"])
        self.assertGreaterEqual(detail["semantic_coverage"], 0.9)
        # score should be >= (0.92 + lexical - 0.2), not minus extra 0.15
        self.assertGreater(score, 0.0)

    # -- extra-positive support score --

    def test_extra_positive_adds_support(self):
        """Prompt matches a positive concept not in desired → support_score."""
        cfg = self._base_config()
        _, detail = score_prompt_semantic(
            "build", "build and test the suite", cfg)
        self.assertEqual(detail["desired_positive_concepts"], ["build"])
        self.assertIn("test", detail["extra_positive_concepts"])
        self.assertGreater(detail["support_score"], 0)

    # -- clamping --

    def test_score_clamped_to_zero(self):
        """Large negative penalty → score clamped to >= 0.0."""
        cfg = self._base_config(
            negative_concepts={
                "heavy": {"weight": 5.0, "phrases": ["avoid"]},
            },
        )
        score, _ = score_prompt_semantic(
            "build", "build and avoid this", cfg)
        self.assertEqual(score, 0.0)

    def test_score_clamped_to_one(self):
        """Very high coverage → score clamped to <= 1.0."""
        cfg = self._base_config(
            positive_concepts={
                "build": {"weight": 1.0, "phrases": ["build"]},
            },
        )
        score, _ = score_prompt_semantic(
            "build the system", "build the whole system today", cfg)
        self.assertLessEqual(score, 1.0)


class TestThresholdBoundary(unittest.TestCase):
    """Threshold classification: score < threshold vs score >= threshold."""

    def test_below_threshold(self):
        """Score clearly below threshold → should be < 0.48."""
        cfg = {
            "positive_concepts": {
                "build": {"weight": 0.5, "phrases": ["build"]},
                "refactor": {"weight": 0.5, "phrases": ["refactor"]},
            },
            "negative_concepts": {},
            "fallback_positive_concepts": [],
        }
        # desired = [build, refactor], prompt only matches build
        # coverage = 0.5, lexical minimal, no support → score ~0.47
        score, _ = score_prompt_semantic(
            "build and refactor", "build foo bar baz qux quux", cfg)
        self.assertLess(score, 0.48)

    def test_at_or_above_threshold(self):
        """Score at or above threshold → should be >= 0.48."""
        cfg = {
            "positive_concepts": {
                "build": {"weight": 0.6, "phrases": ["build"]},
                "test": {"weight": 0.4, "phrases": ["test"]},
            },
            "negative_concepts": {},
            "fallback_positive_concepts": [],
        }
        # desired = [build, test], prompt matches both
        # coverage = 1.0, boost = 0.04, some lexical → score > 0.48
        score, _ = score_prompt_semantic(
            "build and test", "build and test everything here", cfg)
        self.assertGreaterEqual(score, 0.48)

    def test_classification_via_evaluate(self):
        """evaluate() correctly applies threshold to individual results."""
        cfg = {
            "positive_concepts": {
                "build": {"weight": 0.6, "phrases": ["build"]},
            },
            "negative_concepts": {},
            "fallback_positive_concepts": [],
        }
        cases = {
            "recommended_threshold": 0.48,
            "should_trigger": ["build the system"],
            "should_not_trigger": ["something completely different"],
            "near_neighbor": [],
        }
        report = evaluate("build the system", cases, 0.48, cfg)
        # "build the system" should have predicted_trigger=True
        trigger_results = report["results"]["should_trigger"]
        self.assertTrue(trigger_results[0]["predicted_trigger"])
        # the non-match should have predicted_trigger=False
        no_trigger = report["results"]["should_not_trigger"]
        self.assertFalse(no_trigger[0]["predicted_trigger"])


class TestHelperFunctions(unittest.TestCase):
    """iter_case_items(), extract_description()."""

    def test_iter_case_items_strings(self):
        cases = {"bucket": ["hello", "world"]}
        items = iter_case_items(cases, "bucket")
        self.assertEqual(len(items), 2)
        for item in items:
            self.assertEqual(item["family"], "default")
            self.assertIn("text", item)

    def test_iter_case_items_dicts(self):
        cases = {"bucket": [{"text": "hello", "family": "qa"}]}
        items = iter_case_items(cases, "bucket")
        self.assertEqual(items[0]["family"], "qa")

    def test_iter_case_items_empty(self):
        self.assertEqual(iter_case_items({}, "missing"), [])

    def test_extract_description_no_frontmatter(self):
        self.assertEqual(extract_description("hello world"), "hello world")

    def test_extract_description_with_frontmatter(self):
        text = "---\ndescription: build the system\n---\ncontent"
        self.assertEqual(extract_description(text), "build the system")

    def test_extract_description_no_description_field(self):
        text = "---\ntitle: hi\n---\ncontent"
        self.assertEqual(extract_description(text), text)

    def test_extract_description_block_scalar(self):
        text = "---\ndescription: >\n  build\n  the system\n---\ncontent"
        self.assertEqual(extract_description(text), "build the system")


class TestCompareReports(unittest.TestCase):
    """compare_reports(): delta computation."""

    def test_deltas(self):
        baseline = {
            "false_positives": 5, "false_negatives": 3,
            "precision": 0.7, "recall": 0.6,
        }
        improved = {
            "false_positives": 2, "false_negatives": 1,
            "precision": 0.85, "recall": 0.9,
        }
        cmp = compare_reports(baseline, improved)
        self.assertEqual(cmp["false_positive_delta"], -3)
        self.assertEqual(cmp["false_negative_delta"], -2)


class TestEvaluateE2E(unittest.TestCase):
    """End-to-end evaluation with inline fixtures and a planted false negative."""

    def test_precision_recall_and_misfires(self):
        config = {
            "positive_concepts": {
                "build": {"weight": 0.6, "phrases": ["build", "compile"]},
                "test": {"weight": 0.4, "phrases": ["test", "verify"]},
            },
            "negative_concepts": {
                "summary": {"weight": 0.3, "phrases": ["summarize"]},
            },
            "fallback_positive_concepts": [],
        }
        cases = {
            "recommended_threshold": 0.48,
            "should_trigger": [
                "build and compile the project",         # TP: matches build
                {"text": "test and verify everything",
                 "family": "qa"},                         # FN: coverage=0.4 < threshold
                "summarize the build",                    # FN: negative penalty drags it down
            ],
            "should_not_trigger": [
                "just summarize the results",             # TN: only negative match
                "read the documentation",                 # TN: no positive match
            ],
            "near_neighbor": [
                "almost build the system",
            ],
        }

        report = evaluate(
            "build and test the whole system codebase",
            cases, 0.48, config,
        )

        # -- precision / recall fields exist --
        for field in ("precision", "recall", "false_positives", "false_negatives"):
            self.assertIn(field, report, f"missing {field}")
        self.assertIsNotNone(report["precision"])
        self.assertIsNotNone(report["recall"])

        # -- misfires list contains the planted false negative --
        self.assertGreater(len(report["misfires"]), 0)
        fn_prompts = [m["prompt"] for m in report["misfires"]
                      if m["reason"] == "false_negative"]
        self.assertIn("summarize the build", fn_prompts)

        # -- bucket_stats structure --
        for bucket in ("should_trigger", "should_not_trigger", "near_neighbor"):
            self.assertIn(bucket, report["bucket_stats"],
                          f"missing bucket_stats[{bucket!r}]")
            self.assertIn("total", report["bucket_stats"][bucket])

        # -- per-result records have all expected fields --
        for item in report["results"]["should_trigger"]:
            for key in ("score", "predicted_trigger", "expected_trigger",
                        "passed", "score_detail", "family"):
                self.assertIn(key, item, f"missing {key!r} in result")

        # -- near_neighbor items can be boundary cases --
        for item in report["results"]["near_neighbor"]:
            if "boundary_case" in item:
                self.assertIsInstance(item["boundary_case"], bool)


if __name__ == "__main__":
    unittest.main()
