#!/usr/bin/env bun
/**
 * SessionStart(source=compact) hook: re-inject the plan's non-negotiables.
 *
 * Compaction summarises what *happened*; it reliably drops what must *stay true*
 * — the reference source of truth, the done-means, the out-of-scope list. Those
 * live in goal.md, which is immutable by contract, so it is the right anchor to
 * replay verbatim after every compaction.
 *
 * PreCompact cannot inject context (documented: no additionalContext, stdout is
 * debug-log only), so this rides SessionStart with source == "compact", where
 * plain stdout reaches Claude. Always exits 0; silent when there is no live plan.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import * as path from "node:path";

const MAX_PLANS = 2;
const MAX_CHARS = 1600;
const SECTIONS = ["参考真源", "Reference source", "Done means", "Explicitly out of scope"];

// ---------------------------------------------------------------------------
// Python-fidelity helpers
// ---------------------------------------------------------------------------

// str(Path(p)) on posix: collapse duplicate slashes, drop trailing slash.
function pyPath(p: string): string {
  const s = p.replace(/\/{2,}/g, "/");
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function print(s: string): void {
  process.stdout.write(s + "\n");
}

// ---------------------------------------------------------------------------
// Plan discovery
// ---------------------------------------------------------------------------

/** Un-archived goal.md files at or under cwd (plan dirs live with the code). */
function findGoals(cwd: string): string[] {
  let out: string;
  try {
    const r = spawnSync(
      "find",
      [cwd, "-maxdepth", "5", "-path", "*/docs/advanced-plans/*",
       "-name", "goal.md", "-not", "-path", "*/_archive/*"],
      { encoding: "utf-8", timeout: 5000 },
    );
    if (r.error) return [];
    out = r.stdout || "";
  } catch {
    return [];
  }
  const paths = out.split("\n").filter((l) => l.trim()).map(pyPath);
  // A vanished file must abort the whole run silently (Python stat() raise →
  // exit 0), so statSync here is deliberately allowed to throw.
  return paths
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, MAX_PLANS);
}

/** Keep only the sections that carry constraints, drop the narrative. */
function sectionsOf(text: string): string {
  const keep: string[] = [];
  let on = false;
  for (const line of text.split(/\r\n?|\n/)) {
    if (line.startsWith("## ")) {
      const low = line.toLowerCase();
      on = SECTIONS.some((s) => low.includes(s.toLowerCase()));
    }
    if (on) keep.push(line);
  }
  return keep.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const payload = JSON.parse(readFileSync(0, "utf-8")) as Record<string, unknown>;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
  if (payload.source !== "compact") return;
  const cwd = pyPath(String(payload.cwd || "."));
  const goals = findGoals(cwd);
  if (!goals.length) return;

  print("<plan-anchor>");
  print(
    "Context was just compacted. These constraints are NOT summaries — they are " +
    "the locked plan and outrank anything the summary implies. Re-read the " +
    "reference source before the next phase if you are about to build against it.",
  );
  for (const g of goals) {
    // Python slices by code points, not UTF-16 units
    const body = [...sectionsOf(readFileSync(g, "utf-8"))].slice(0, MAX_CHARS).join("");
    if (!body) continue;
    const parent = path.posix.dirname(g);
    print(`\n### ${path.posix.basename(parent)} (${g})`);
    print(body);
    const proto = path.posix.join(parent, "prototype.html");
    if (isFile(proto)) {
      print(`\n**目标原型(已批准的验收参照物)**: ${proto}`);
    }
  }
  print("</plan-anchor>");
}

try {
  run();
} catch {
  // fail-open: any exception → silent exit 0
}
process.exit(0);
