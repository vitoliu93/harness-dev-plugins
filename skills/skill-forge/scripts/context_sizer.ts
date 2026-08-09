#!/usr/bin/env bun
// Estimate context size for a skill package.
// Ported 1:1 from context_sizer.py.

import fs from "node:fs";
import path from "node:path";
import {
  parseCli,
  pathMatch,
  pyJsonDumps,
  pyLen,
  pyResolve,
  readTextIgnoreFallback,
  walkAll,
  type CliSpec,
} from "./pycompat.ts";

export const TEXT_EXTS = new Set([".css", ".md", ".txt", ".yaml", ".yml", ".json", ".py", ".sh", ".js", ".ts"]);
const IGNORED_RELATIVE_DIRS = [
  ["reports", "release_snapshots"],
  ["tests", "tmp"],
  ["tests", "tmp_snapshot"],
  ["tests", "tmp_cli"],
];
export const PACKAGE_PATHS = [
  "SKILL.md",
  "manifest.json",
  "agents",
  "references",
  "scripts",
  "assets",
  "evals",
  "templates",
  "reports",
  "failures",
  "tests",
  "input",
  "outputs",
];
const IGNORED_FILE_PATTERNS = [
  "reports/benchmark_reproducibility*.json",
  "reports/benchmark_reproducibility*.md",
  "reports/context_budget*.json",
  "reports/context_budget*.md",
  "reports/evidence_consistency*.json",
  "reports/evidence_consistency*.md",
  "reports/review-studio*.html",
  "reports/review-studio*.json",
  "reports/review-viewer*.html",
  "reports/review-viewer*.json",
  "reports/skill-interpretation*.html",
  "reports/skill-interpretation*.json",
  "reports/skill-overview*.html",
  "reports/skill-overview*.json",
  "reports/world_class_evidence_preflight*.json",
  "reports/world_class_evidence_preflight*.md",
  "reports/world_class_evidence_preflight*.html",
  "reports/*pattern-analysis*.md",
  "reports/*research-plan*.md",
];

/** pathlib Path.suffix: "" for dotfiles and trailing dots, else ".ext". */
function pySuffix(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 && idx < name.length - 1 ? name.slice(idx) : "";
}

export function estimate_tokens(text: string): number {
  // Fast heuristic suitable for local gating.
  return Math.max(1, Math.floor(pyLen(text) / 4));
}

export function classify(relPath: string): string {
  const parts = new Set(relPath.split("/"));
  if (relPath === "SKILL.md") return "skill_body";
  if (parts.has("agents")) return "interface";
  if (parts.has("references")) return "reference";
  if (parts.has("scripts")) return "script";
  if (parts.has("assets")) return "asset";
  if (TEXT_EXTS.has(pySuffix(path.basename(relPath)))) return "other_text";
  return "binary_or_other";
}

export function should_ignore(p: string, skillDir: string): boolean {
  const rel = path.relative(skillDir, p);
  const relParts = rel.split("/");
  for (const ignored of IGNORED_RELATIVE_DIRS) {
    if (relParts.length >= ignored.length && ignored.every((part, idx) => relParts[idx] === part)) return true;
  }
  if (IGNORED_FILE_PATTERNS.some((pattern) => pathMatch(rel, pattern))) return true;
  return relParts.length >= 2 && relParts[0] === "tests" && relParts[1].startsWith("tmp_");
}

export function summarize(skillDir: string): Record<string, any> {
  const files: Array<Record<string, any>> = [];
  let totalTokens = 0;
  let initialTokens = 0;
  const candidateFiles: string[] = [];
  for (const entry of PACKAGE_PATHS) {
    const p = path.join(skillDir, entry);
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(p);
    } catch {
      stat = null;
    }
    if (stat?.isFile()) {
      candidateFiles.push(p);
    } else if (stat?.isDirectory()) {
      const nested = walkAll(p)
        .filter((file) => {
          try {
            return fs.statSync(file).isFile();
          } catch {
            return false;
          }
        })
        .sort();
      candidateFiles.push(...nested);
    }
  }

  for (const p of candidateFiles) {
    if (should_ignore(p, skillDir)) continue;
    const rel = path.relative(skillDir, p);
    const suffix = pySuffix(path.basename(p));
    if (!TEXT_EXTS.has(suffix) && path.basename(p) !== "SKILL.md") {
      const size = fs.statSync(p).size;
      files.push({ path: rel, kind: "binary_or_other", bytes: size });
      continue;
    }
    const kind = classify(rel);
    if ((kind === "binary_or_other" || kind === "asset") && !TEXT_EXTS.has(suffix)) {
      const size = fs.statSync(p).size;
      files.push({ path: rel, kind, bytes: size });
      continue;
    }
    const text = readTextIgnoreFallback(p);
    const tokenCount = estimate_tokens(text);
    files.push({
      path: rel,
      kind,
      chars: pyLen(text),
      estimated_tokens: tokenCount,
    });
    totalTokens += tokenCount;
    if (rel === "SKILL.md" || rel.split("/")[0] === "agents") {
      initialTokens += tokenCount;
    }
  }
  return {
    skill_dir: skillDir,
    estimated_initial_load_tokens: initialTokens,
    estimated_total_text_tokens: totalTokens,
    warning: initialTokens > 2000,
    files,
  };
}

function main(): void {
  const spec: CliSpec = {
    prog: path.basename(process.argv[1] ?? "context_sizer.ts"),
    description: "Estimate context size for a skill package.",
    options: [{ flag: "--json", dest: "json", kind: "store_true", help: "Emit machine-readable JSON" }],
    positionals: [{ name: "skill_dir", help: "Path to the skill directory" }],
  };
  const args = parseCli(spec, process.argv.slice(2));

  const report = summarize(pyResolve(args.skill_dir));
  if (args.json) {
    process.stdout.write(pyJsonDumps(report) + "\n");
    return;
  }

  process.stdout.write(`Skill: ${report["skill_dir"]}\n`);
  process.stdout.write(`Estimated initial-load tokens: ${report["estimated_initial_load_tokens"]}\n`);
  process.stdout.write(`Estimated total text tokens: ${report["estimated_total_text_tokens"]}\n`);
  process.stdout.write(`Initial-load warning (>2000): ${report["warning"] ? "YES" : "NO"}\n`);
  process.stdout.write("\n");
  for (const file of report["files"]) {
    if ("estimated_tokens" in file) {
      process.stdout.write(`${file["kind"].padEnd(12)} ${String(file["estimated_tokens"]).padStart(6)}t  ${file["path"]}\n`);
    } else {
      process.stdout.write(`${file["kind"].padEnd(12)} ${String(file["bytes"]).padStart(6)}b  ${file["path"]}\n`);
    }
  }
}

if (import.meta.main) {
  main();
}
