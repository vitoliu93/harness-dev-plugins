#!/usr/bin/env bun
// Semantic trigger quality evaluator.
// Ported 1:1 from trigger_eval.py — float outputs keep Python round()/repr
// semantics via pycompat so the JSON report is byte-identical.

import fs from "node:fs";
import path from "node:path";
import {
  F,
  PyFloat,
  PY_WS_CLASS,
  num,
  parseCli,
  pyJsonDumps,
  pyJsonParse,
  pyStrip,
  pySplitLines,
  pySumNumber,
  pyTruthy,
  readTextStrict,
  round3,
  round3Auto,
  stripChars,
  type CliSpec,
} from "./pycompat.ts";

const WORD_RE = /[\p{L}\p{N}_\u4e00-\u9fff]+/gu;
const DEFAULT_CONFIG_PATH = "evals/semantic_config.json";

const has = (o: any, k: string): boolean =>
  o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const get = (o: any, k: string, def: any = null): any => (has(o, k) ? o[k] : def);

export function normalize(text: string): string {
  let out = text.toLowerCase();
  out = out.replace(/[^\p{L}\p{N}_\u4e00-\u9fff]+/gu, " ");
  return pyStrip(out.replace(new RegExp(`[${PY_WS_CLASS}]+`, "gu"), " "));
}

export function words(text: string): Set<string> {
  const found = text.match(WORD_RE) ?? [];
  return new Set(found.map((w) => w.toLowerCase()));
}

function load_json(p: string): any {
  return pyJsonParse(readTextStrict(p));
}

export function extract_description(text: string): string {
  if (!text.startsWith("---")) return text;
  // text.split("---", 2) — maxsplit, keeping the remainder unsplit.
  const first = text.indexOf("---");
  let parts: string[];
  if (first < 0) {
    parts = [text];
  } else {
    const second = text.indexOf("---", first + 3);
    parts =
      second < 0
        ? [text.slice(0, first), text.slice(first + 3)]
        : [text.slice(0, first), text.slice(first + 3, second), text.slice(second + 3)];
  }
  if (parts.length < 3) return text;
  const frontmatter = pySplitLines(parts[1]);
  for (let idx = 0; idx < frontmatter.length; idx++) {
    const line = frontmatter[idx];
    if (!pyStrip(line).startsWith("description:")) continue;
    const value = pyStrip(line.slice(line.indexOf(":") + 1));
    if (value === ">" || value === ">-" || value === "|" || value === "|-") {
      const block: string[] = [];
      for (const cont of frontmatter.slice(idx + 1)) {
        const first0 = cont.slice(0, 1);
        if (first0 === " " || first0 === "\t" || !pyStrip(cont)) {
          if (pyStrip(cont)) block.push(pyStrip(cont));
          continue;
        }
        break;
      }
      return block.join(" ");
    }
    return stripChars(value, "'\"");
  }
  return text;
}

export function iter_case_items(cases: Record<string, any>, bucket: string): Array<Record<string, any>> {
  const items: Array<Record<string, any>> = [];
  for (const raw of get(cases, bucket, [])) {
    if (typeof raw === "string") {
      items.push({ text: raw, family: "default" });
    } else {
      const item = { ...raw };
      if (!has(item, "family")) item["family"] = "default";
      items.push(item);
    }
  }
  return items;
}

export function phrase_present(text: string, phrase: string): boolean {
  const normalized = normalize(phrase);
  if (!normalized) return false;
  if (/[\u4e00-\u9fff]/.test(normalized)) return text.includes(normalized);
  return ` ${text} `.includes(` ${normalized} `);
}

export function load_semantic_config(p: string | null): Record<string, any> {
  const configPath = p ?? DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(configPath)) {
    process.stderr.write(`Semantic config not found: ${path.posix.normalize(configPath)}\n`);
    process.exit(1);
  }
  return load_json(configPath);
}

export function collect_concept_hits(
  text: string,
  concepts: Record<string, Record<string, any>>,
): Record<string, Record<string, any>> {
  const normalized = normalize(text);
  const hits: Record<string, Record<string, any>> = {};
  for (const [name, spec] of Object.entries(concepts)) {
    const matched: string[] = [];
    for (const phrase of get(spec, "phrases", [])) {
      if (phrase_present(normalized, phrase)) matched.push(phrase);
    }
    if (matched.length > 0) {
      hits[name] = {
        weight: spec["weight"],
        matched_phrases: matched,
        exclusive: pyTruthy(get(spec, "exclusive")),
      };
    }
  }
  return hits;
}

export function lexical_support(descriptionWords: Set<string>, prompt: string): number {
  const promptWords = words(prompt);
  if (promptWords.size === 0) return 0.0;
  let overlap = 0;
  for (const w of promptWords) if (descriptionWords.has(w)) overlap++;
  return overlap / promptWords.size;
}

export function desired_positive_concepts(description: string, config: Record<string, any>): string[] {
  const descriptionHits = collect_concept_hits(description, config["positive_concepts"]);
  const names = Object.keys(descriptionHits);
  if (names.length > 0) return names;
  return get(config, "fallback_positive_concepts", []);
}

export function score_prompt_semantic(
  description: string,
  prompt: string,
  config: Record<string, any>,
): [number, Record<string, any>] {
  const positiveConcepts = config["positive_concepts"];
  const negativeConcepts = config["negative_concepts"];
  const desired = desired_positive_concepts(description, config);
  const desiredWeightTotal = desired.reduce((acc, name) => acc + num(positiveConcepts[name]["weight"]), 0) || 1.0;

  const promptPositiveHits = collect_concept_hits(prompt, positiveConcepts);
  const promptNegativeHits = collect_concept_hits(prompt, negativeConcepts);

  const matchedDesired = desired.filter((name) => has(promptPositiveHits, name)).sort();
  const extraPositive = Object.keys(promptPositiveHits)
    .filter((name) => !matchedDesired.includes(name))
    .sort();
  const semanticCoverage =
    matchedDesired.reduce((acc, name) => acc + num(positiveConcepts[name]["weight"]), 0) / desiredWeightTotal;
  // Python sum() over an empty iterable is int 0 — keep the int/float lexeme.
  const supportScore = pySumNumber(extraPositive.map((name) => positiveConcepts[name]["weight"]));

  const exclusiveNegative = Object.keys(promptNegativeHits)
    .filter((name) => pyTruthy(promptNegativeHits[name]["exclusive"]))
    .sort();
  const negativePenalty = pySumNumber(Object.values(promptNegativeHits).map((hit) => hit["weight"]));
  const lexical = lexical_support(words(description), prompt);

  let coverageBoost = 0.0;
  if (matchedDesired.length >= 2) coverageBoost += 0.04;
  if (matchedDesired.length >= 3) coverageBoost += 0.02;

  let score =
    semanticCoverage * 0.92 +
    Math.min(0.12, num(supportScore) * 0.25) +
    Math.min(0.06, lexical * 0.08) +
    coverageBoost;
  score -= num(negativePenalty);
  if (exclusiveNegative.length > 0 && semanticCoverage < 0.9) score -= 0.15;
  score = Math.max(0.0, Math.min(1.0, score));

  const scoreDetail: Record<string, any> = {
    mode: "semantic-intent",
    desired_positive_concepts: desired,
    matched_desired_concepts: matchedDesired,
    extra_positive_concepts: extraPositive,
    matched_negative_concepts: Object.keys(promptNegativeHits).sort(),
    exclusive_negative_concepts: exclusiveNegative,
    semantic_coverage: round3(semanticCoverage),
    support_score: round3Auto(supportScore),
    lexical_support: round3(lexical),
    negative_penalty: round3Auto(negativePenalty),
    coverage_boost: round3(coverageBoost),
    concept_evidence: {
      positive: Object.fromEntries(
        Object.keys(promptPositiveHits)
          .sort()
          .map((name) => [name, promptPositiveHits[name]["matched_phrases"]]),
      ),
      negative: Object.fromEntries(
        Object.keys(promptNegativeHits)
          .sort()
          .map((name) => [name, promptNegativeHits[name]["matched_phrases"]]),
      ),
    },
  };
  return [score, scoreDetail];
}

function classify_bucket(bucket: string): boolean {
  return bucket === "should_trigger";
}

export function evaluate(
  description: string,
  cases: Record<string, any>,
  threshold: number | PyFloat,
  config: Record<string, any>,
): Record<string, any> {
  const t = num(threshold);
  const results: Record<string, any[]> = { should_trigger: [], should_not_trigger: [], near_neighbor: [] };
  let fp = 0;
  let fn = 0;
  const bucketStats: Record<string, any> = {};
  const familyStats = new Map<string, Record<string, any>>();
  const misfires: Array<Record<string, any>> = [];

  for (const bucket of ["should_trigger", "should_not_trigger", "near_neighbor"]) {
    const expected = classify_bucket(bucket);
    const items = iter_case_items(cases, bucket);
    let total = 0;
    let passedCount = 0;
    for (const item of items) {
      const prompt = item["text"];
      const family = get(item, "family", "default");
      const [score, scoreDetail] = score_prompt_semantic(description, prompt, config);
      const predicted = score >= t;
      const passed = predicted === expected;
      total += 1;
      if (passed) passedCount += 1;
      if (!passed && expected) fn += 1;
      if (!passed && !expected) fp += 1;

      const record: Record<string, any> = {
        prompt,
        family,
        score: round3(score),
        predicted_trigger: predicted,
        expected_trigger: expected,
        passed,
        score_detail: scoreDetail,
      };
      if (0.75 * t <= score && score <= 1.25 * t) {
        record["boundary_case"] = true;
      }
      results[bucket].push(record);

      if (!familyStats.has(family)) {
        familyStats.set(family, { total: 0, passed: 0, false_positives: 0, false_negatives: 0 });
      }
      const familyBucket = familyStats.get(family)!;
      familyBucket["total"] += 1;
      if (passed) familyBucket["passed"] += 1;
      else if (expected) familyBucket["false_negatives"] += 1;
      else familyBucket["false_positives"] += 1;

      if (!passed) {
        misfires.push({
          bucket,
          family,
          prompt,
          score: round3(score),
          reason: expected ? "false_negative" : "false_positive",
          matched_desired_concepts: scoreDetail["matched_desired_concepts"],
          matched_negative_concepts: scoreDetail["matched_negative_concepts"],
        });
      }
    }

    bucketStats[bucket] = {
      total,
      passed: passedCount,
      pass_rate: total ? round3(passedCount / total) : null,
    };
  }

  const familyStatsObj: Record<string, any> = {};
  for (const [family, stats] of familyStats) {
    stats["pass_rate"] = stats["total"] ? round3(stats["passed"] / stats["total"]) : null;
    familyStatsObj[family] = stats;
  }

  const tp = results["should_trigger"].filter((item) => item["predicted_trigger"]).length;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;

  return {
    threshold,
    threshold_explanation:
      "Prompts at or above the threshold are treated as trigger matches. " +
      "Scores are driven primarily by semantic intent coverage: packaging intent, " +
      "workflow-to-skill transformation intent, reuse/distribution intent, and eval intent. " +
      "Explicit exclusions such as summary-only, translation-only, one-off, document-only, " +
      "or do-not-build directives apply direct penalties and can override otherwise similar wording.",
    false_positives: fp,
    false_negatives: fn,
    precision: precision !== null ? round3(precision) : null,
    recall: recall !== null ? round3(recall) : null,
    bucket_stats: bucketStats,
    family_stats: familyStatsObj,
    misfires,
    results,
  };
}

export function compare_reports(baseline: Record<string, any>, improved: Record<string, any>): Record<string, any> {
  return {
    baseline_false_positives: baseline["false_positives"],
    baseline_false_negatives: baseline["false_negatives"],
    improved_false_positives: improved["false_positives"],
    improved_false_negatives: improved["false_negatives"],
    false_positive_delta: improved["false_positives"] - baseline["false_positives"],
    false_negative_delta: improved["false_negatives"] - baseline["false_negatives"],
    baseline_precision: baseline["precision"],
    improved_precision: improved["precision"],
    baseline_recall: baseline["recall"],
    improved_recall: improved["recall"],
  };
}

function main(): void {
  const spec: CliSpec = {
    prog: path.basename(process.argv[1] ?? "trigger_eval.ts"),
    description: "Semantic trigger quality evaluator.",
    options: [
      { flag: "--description", dest: "description", kind: "store", type: "str", help: "Description string to evaluate" },
      { flag: "--description-file", dest: "description_file", kind: "store", type: "str", help: "Read description text from file" },
      { flag: "--baseline-description", dest: "baseline_description", kind: "store", type: "str", help: "Baseline description string to compare against" },
      { flag: "--baseline-description-file", dest: "baseline_description_file", kind: "store", type: "str", help: "Read baseline description from file" },
      { flag: "--cases", dest: "cases", kind: "store", type: "str", required: true, help: "JSON file with trigger cases" },
      { flag: "--semantic-config", dest: "semantic_config", kind: "store", type: "str", default: DEFAULT_CONFIG_PATH, help: "Semantic config JSON" },
      { flag: "--threshold", dest: "threshold", kind: "store", type: "float", help: "Trigger threshold override" },
    ],
  };
  const args = parseCli(spec, process.argv.slice(2));

  let description = args.description;
  if (args.description_file) {
    description = extract_description(readTextStrict(args.description_file));
  }
  if (!pyTruthy(description)) {
    process.stderr.write("Provide --description or --description-file\n");
    process.exit(1);
  }

  const cases = load_json(args.cases);
  const config = load_semantic_config(args.semantic_config);
  const threshold = args.threshold !== null ? args.threshold : get(cases, "recommended_threshold", F(0.48));
  const report = evaluate(description, cases, threshold, config);

  let baseline = args.baseline_description;
  if (args.baseline_description_file) {
    baseline = extract_description(readTextStrict(args.baseline_description_file));
  }
  if (pyTruthy(baseline)) {
    report["comparison"] = compare_reports(evaluate(baseline, cases, threshold, config), report);
  }

  process.stdout.write(pyJsonDumps(report) + "\n");
  if (report["false_positives"] > 0 || report["false_negatives"] > 0) {
    process.exit(2);
  }
}

if (import.meta.main) {
  main();
}
