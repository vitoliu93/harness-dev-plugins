import { describe, expect, test } from "bun:test";

import { num } from "./pycompat.ts";
import {
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
} from "./trigger_eval.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("normalize", () => {
  test("lowercase", () => {
    expect(normalize("Hello World")).toBe("hello world");
  });

  test("strips non-word chars", () => {
    expect(normalize("hello, world! test.")).toBe("hello world test");
  });

  test("collapses whitespace", () => {
    expect(normalize("hello   world")).toBe("hello world");
  });

  test("retains cjk", () => {
    expect(normalize("hello 世界")).toBe("hello 世界");
  });

  test("strips outer whitespace", () => {
    expect(normalize("  hello  ")).toBe("hello");
  });
});

describe("words", () => {
  test("basic", () => {
    expect(words("hello world")).toEqual(new Set(["hello", "world"]));
  });

  test("cjk", () => {
    expect(words("hello 世界")).toEqual(new Set(["hello", "世界"]));
  });

  test("punctuation dropped", () => {
    expect(words("hello, world!")).toEqual(new Set(["hello", "world"]));
  });

  test("deduplicates", () => {
    expect(words("hello hello")).toEqual(new Set(["hello"]));
  });
});

describe("phrase_present", () => {
  test("latin whole word", () => {
    expect(phrase_present("build the system", "build")).toBe(true);
  });

  test("latin no substring", () => {
    // Latin phrase must be a whole word (not substring of another word).
    expect(phrase_present("my builds", "build")).toBe(false);
  });

  test("cjk substring ok", () => {
    expect(phrase_present("测试系统构建", "系统构")).toBe(true);
  });

  test("empty phrase", () => {
    expect(phrase_present("anything", "")).toBe(false);
  });

  test("normalized text latin", () => {
    // Works with pre-normalized (lowercased) text — as callers provide.
    expect(phrase_present("build system", "build")).toBe(true);
  });

  test("not present", () => {
    expect(phrase_present("hello world", "build")).toBe(false);
  });
});

describe("collect_concept_hits", () => {
  test("single match", () => {
    const concepts = { build: { weight: 0.6, phrases: ["build", "compile"] } };
    const hits = collect_concept_hits("build the system", concepts);
    expect(hits).toHaveProperty("build");
    expect(num(hits["build"]["weight"])).toBe(0.6);
    expect(hits["build"]["matched_phrases"]).toContain("build");
  });

  test("multiple matches", () => {
    const concepts = {
      build: { weight: 0.6, phrases: ["build"] },
      docs: { weight: 0.4, phrases: ["documentation"] },
    };
    const hits = collect_concept_hits("build the documentation", concepts);
    expect(hits).toHaveProperty("build");
    expect(hits).toHaveProperty("docs");
  });

  test("no match", () => {
    const hits = collect_concept_hits("hello world", { build: { weight: 1.0, phrases: ["build"] } });
    expect(hits).toEqual({});
  });

  test("exclusive flag preserved", () => {
    const concepts = {
      no_code: { weight: 0.4, phrases: ["no code"], exclusive: true },
    };
    const hits = collect_concept_hits("write no code", concepts);
    expect(hits["no_code"]["exclusive"]).toBe(true);
  });
});

describe("lexical_support", () => {
  test("full overlap", () => {
    expect(lexical_support(new Set(["build", "system"]), "build system")).toBe(1.0);
  });

  test("partial overlap", () => {
    expect(lexical_support(new Set(["build", "system", "test"]), "build fast")).toBeCloseTo(0.5, 7);
  });

  test("no overlap", () => {
    expect(lexical_support(new Set(["a", "b"]), "c d")).toBe(0.0);
  });

  test("empty prompt", () => {
    expect(lexical_support(new Set(["a"]), "")).toBe(0.0);
  });
});

describe("desired_positive_concepts", () => {
  test("selects from description", () => {
    const config = {
      positive_concepts: {
        build: { weight: 0.6, phrases: ["build"] },
        test: { weight: 0.4, phrases: ["test"] },
      },
      fallback_positive_concepts: [],
    };
    expect(desired_positive_concepts("build this", config)).toEqual(["build"]);
  });

  test("fallback when no match", () => {
    const config = {
      positive_concepts: {
        build: { weight: 0.6, phrases: ["build"] },
      },
      fallback_positive_concepts: ["generic"],
    };
    expect(desired_positive_concepts("something else", config)).toEqual(["generic"]);
  });

  test("empty fallback returns empty", () => {
    const config = {
      positive_concepts: {},
      fallback_positive_concepts: [],
    };
    expect(desired_positive_concepts("anything", config)).toEqual([]);
  });
});

describe("score_prompt_semantic", () => {
  const baseConfig = (overrides: Record<string, any> = {}): Record<string, any> => ({
    positive_concepts: {
      build: { weight: 0.6, phrases: ["build", "compile"] },
      test: { weight: 0.4, phrases: ["test", "verify"] },
    },
    negative_concepts: {},
    fallback_positive_concepts: [],
    ...overrides,
  });

  // -- desired-concept selection from description --

  test("desired concept picked from description", () => {
    const [, detail] = score_prompt_semantic("build the system", "build it", baseConfig());
    expect(detail["desired_positive_concepts"]).toEqual(["build"]);
  });

  // -- coverage math: single vs multiple matched concepts --

  test("single desired concept matched full coverage", () => {
    const [, detail] = score_prompt_semantic("build the system", "please build and compile", baseConfig());
    expect(detail["matched_desired_concepts"]).toEqual(["build"]);
    expect(num(detail["semantic_coverage"])).toBe(1.0);
    expect(num(detail["coverage_boost"])).toBe(0.0);
  });

  test("single matched partial coverage", () => {
    const [, detail] = score_prompt_semantic("build and test", "build the system", baseConfig());
    // desired = ["build", "test"], only "build" matched
    expect(detail["matched_desired_concepts"]).toEqual(["build"]);
    expect(num(detail["semantic_coverage"])).toBeCloseTo(0.6, 7); // 0.6 / 1.0
    expect(num(detail["coverage_boost"])).toBe(0.0);
  });

  test("two matched desired boost 004", () => {
    const [, detail] = score_prompt_semantic("build and test", "build the test suite", baseConfig());
    expect(detail["matched_desired_concepts"]).toHaveLength(2);
    expect(num(detail["coverage_boost"])).toBe(0.04);
  });

  test("three matched desired boost 006", () => {
    const cfg = baseConfig({
      positive_concepts: {
        a: { weight: 0.3, phrases: ["alpha"] },
        b: { weight: 0.4, phrases: ["bravo"] },
        c: { weight: 0.3, phrases: ["charlie"] },
      },
    });
    const [, detail] = score_prompt_semantic("alpha bravo charlie", "alpha bravo charlie", cfg);
    expect(detail["matched_desired_concepts"]).toHaveLength(3);
    expect(num(detail["coverage_boost"])).toBe(0.06);
  });

  // -- negative-concept penalty --

  test("negative penalty applied", () => {
    const cfg = baseConfig({
      negative_concepts: {
        summary: { weight: 0.25, phrases: ["summarize"] },
      },
    });
    const [score, detail] = score_prompt_semantic("build the system", "build and summarize", cfg);
    expect(detail["matched_negative_concepts"]).toContain("summary");
    expect(num(detail["negative_penalty"])).toBe(0.25);
    // score should be lower than without the penalty
    const [scoreClean] = score_prompt_semantic("build the system", "build only", cfg);
    expect(score).toBeLessThan(scoreClean);
  });

  // -- exclusive-negative behavior --

  test("exclusive negative low coverage extra penalty", () => {
    const cfg = {
      positive_concepts: {
        build: { weight: 0.5, phrases: ["build"] },
        refactor: { weight: 0.5, phrases: ["refactor"] },
      },
      negative_concepts: {
        no_code: { weight: 0.3, phrases: ["no code"], exclusive: true },
      },
      fallback_positive_concepts: [],
    };
    // description hits build+refactor; prompt only matches build + no_code
    // → coverage = 0.5, exclusive_negative active, extra 0.15 penalty
    const [score, detail] = score_prompt_semantic("build and refactor", "build no code ever", cfg);
    expect(detail["exclusive_negative_concepts"]).toEqual(["no_code"]);
    expect(num(detail["semantic_coverage"])).toBeCloseTo(0.5, 7);
    // score should be well below what just the normal negative penalty gives
    expect(score).toBeLessThan(0.3);
  });

  test("exclusive negative high coverage no extra", () => {
    const cfg = {
      positive_concepts: {
        build: { weight: 1.0, phrases: ["build"] },
      },
      negative_concepts: {
        avoid: { weight: 0.2, phrases: ["don't"], exclusive: true },
      },
      fallback_positive_concepts: [],
    };
    const [score, detail] = score_prompt_semantic("build the system", "build don't do that", cfg);
    expect(detail["exclusive_negative_concepts"]).toContain("avoid");
    expect(num(detail["semantic_coverage"])).toBeGreaterThanOrEqual(0.9);
    // score should be >= (0.92 + lexical - 0.2), not minus extra 0.15
    expect(score).toBeGreaterThan(0.0);
  });

  // -- extra-positive support score --

  test("extra positive adds support", () => {
    const cfg = baseConfig();
    const [, detail] = score_prompt_semantic("build", "build and test the suite", cfg);
    expect(detail["desired_positive_concepts"]).toEqual(["build"]);
    expect(detail["extra_positive_concepts"]).toContain("test");
    expect(num(detail["support_score"])).toBeGreaterThan(0);
  });

  // -- clamping --

  test("score clamped to zero", () => {
    const cfg = baseConfig({
      negative_concepts: {
        heavy: { weight: 5.0, phrases: ["avoid"] },
      },
    });
    const [score] = score_prompt_semantic("build", "build and avoid this", cfg);
    expect(score).toBe(0.0);
  });

  test("score clamped to one", () => {
    const cfg = baseConfig({
      positive_concepts: {
        build: { weight: 1.0, phrases: ["build"] },
      },
    });
    const [score] = score_prompt_semantic("build the system", "build the whole system today", cfg);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

describe("threshold boundary", () => {
  test("below threshold", () => {
    const cfg = {
      positive_concepts: {
        build: { weight: 0.5, phrases: ["build"] },
        refactor: { weight: 0.5, phrases: ["refactor"] },
      },
      negative_concepts: {},
      fallback_positive_concepts: [],
    };
    // desired = [build, refactor], prompt only matches build
    // coverage = 0.5, lexical minimal, no support → score ~0.47
    const [score] = score_prompt_semantic("build and refactor", "build foo bar baz qux quux", cfg);
    expect(score).toBeLessThan(0.48);
  });

  test("at or above threshold", () => {
    const cfg = {
      positive_concepts: {
        build: { weight: 0.6, phrases: ["build"] },
        test: { weight: 0.4, phrases: ["test"] },
      },
      negative_concepts: {},
      fallback_positive_concepts: [],
    };
    // desired = [build, test], prompt matches both
    // coverage = 1.0, boost = 0.04, some lexical → score > 0.48
    const [score] = score_prompt_semantic("build and test", "build and test everything here", cfg);
    expect(score).toBeGreaterThanOrEqual(0.48);
  });

  test("classification via evaluate", () => {
    const cfg = {
      positive_concepts: {
        build: { weight: 0.6, phrases: ["build"] },
      },
      negative_concepts: {},
      fallback_positive_concepts: [],
    };
    const cases = {
      recommended_threshold: 0.48,
      should_trigger: ["build the system"],
      should_not_trigger: ["something completely different"],
      near_neighbor: [],
    };
    const report = evaluate("build the system", cases, 0.48, cfg);
    // "build the system" should have predicted_trigger=true
    const triggerResults = report["results"]["should_trigger"];
    expect(triggerResults[0]["predicted_trigger"]).toBe(true);
    // the non-match should have predicted_trigger=false
    const noTrigger = report["results"]["should_not_trigger"];
    expect(noTrigger[0]["predicted_trigger"]).toBe(false);
  });
});

describe("helper functions", () => {
  test("iter_case_items strings", () => {
    const cases = { bucket: ["hello", "world"] };
    const items = iter_case_items(cases, "bucket");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item["family"]).toBe("default");
      expect(item).toHaveProperty("text");
    }
  });

  test("iter_case_items dicts", () => {
    const cases = { bucket: [{ text: "hello", family: "qa" }] };
    const items = iter_case_items(cases, "bucket");
    expect(items[0]["family"]).toBe("qa");
  });

  test("iter_case_items empty", () => {
    expect(iter_case_items({}, "missing")).toEqual([]);
  });

  test("extract_description no frontmatter", () => {
    expect(extract_description("hello world")).toBe("hello world");
  });

  test("extract_description with frontmatter", () => {
    const text = "---\ndescription: build the system\n---\ncontent";
    expect(extract_description(text)).toBe("build the system");
  });

  test("extract_description no description field", () => {
    const text = "---\ntitle: hi\n---\ncontent";
    expect(extract_description(text)).toBe(text);
  });

  test("extract_description block scalar", () => {
    const text = "---\ndescription: >\n  build\n  the system\n---\ncontent";
    expect(extract_description(text)).toBe("build the system");
  });
});

describe("compare_reports", () => {
  test("deltas", () => {
    const baseline = {
      false_positives: 5,
      false_negatives: 3,
      precision: 0.7,
      recall: 0.6,
    };
    const improved = {
      false_positives: 2,
      false_negatives: 1,
      precision: 0.85,
      recall: 0.9,
    };
    const cmp = compare_reports(baseline, improved);
    expect(cmp["false_positive_delta"]).toBe(-3);
    expect(cmp["false_negative_delta"]).toBe(-2);
  });
});

describe("evaluate e2e", () => {
  test("precision recall and misfires", () => {
    const config = {
      positive_concepts: {
        build: { weight: 0.6, phrases: ["build", "compile"] },
        test: { weight: 0.4, phrases: ["test", "verify"] },
      },
      negative_concepts: {
        summary: { weight: 0.3, phrases: ["summarize"] },
      },
      fallback_positive_concepts: [],
    };
    const cases = {
      recommended_threshold: 0.48,
      should_trigger: [
        "build and compile the project", // TP: matches build
        { text: "test and verify everything", family: "qa" }, // FN: coverage=0.4 < threshold
        "summarize the build", // FN: negative penalty drags it down
      ],
      should_not_trigger: [
        "just summarize the results", // TN: only negative match
        "read the documentation", // TN: no positive match
      ],
      near_neighbor: ["almost build the system"],
    };

    const report = evaluate("build and test the whole system codebase", cases, 0.48, config);

    // -- precision / recall fields exist --
    for (const field of ["precision", "recall", "false_positives", "false_negatives"]) {
      expect(report).toHaveProperty(field);
    }
    expect(report["precision"]).not.toBeNull();
    expect(report["recall"]).not.toBeNull();

    // -- misfires list contains the planted false negative --
    expect(report["misfires"].length).toBeGreaterThan(0);
    const fnPrompts = report["misfires"]
      .filter((m: Record<string, any>) => m["reason"] === "false_negative")
      .map((m: Record<string, any>) => m["prompt"]);
    expect(fnPrompts).toContain("summarize the build");

    // -- bucket_stats structure --
    for (const bucket of ["should_trigger", "should_not_trigger", "near_neighbor"]) {
      expect(report["bucket_stats"]).toHaveProperty(bucket);
      expect(report["bucket_stats"][bucket]).toHaveProperty("total");
    }

    // -- per-result records have all expected fields --
    for (const item of report["results"]["should_trigger"]) {
      for (const key of ["score", "predicted_trigger", "expected_trigger", "passed", "score_detail", "family"]) {
        expect(item).toHaveProperty(key);
      }
    }

    // -- near_neighbor items can be boundary cases --
    for (const item of report["results"]["near_neighbor"]) {
      if ("boundary_case" in item) {
        expect(typeof item["boundary_case"]).toBe("boolean");
      }
    }
  });
});
