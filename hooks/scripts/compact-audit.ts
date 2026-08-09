#!/usr/bin/env bun
/**
 * PostCompact hook: record what each compaction dropped.
 *
 * The expensive lesson: over one 38-hour task the context was compacted 8 times
 * and the design source's path appeared in **zero** of the 8 summaries — the
 * half-life of a reference source is one compaction. That was only discovered by
 * digging through the transcript weeks later. This makes it a fact on disk at the
 * moment it happens.
 *
 * Deliberately **no model call**. Anchors are concrete strings (a path, a plan
 * slug, an issue ident); "is it in the summary" is a substring test, and a hook
 * must be fast and unable to fail. Semantic questions ("what *else* got lost")
 * belong at debrief time, over the accumulated ledger, on ccobs's cheap engine —
 * not inline here.
 *
 * PostCompact has no decision control (documented) — this only observes.
 * Ledger: ~/.claude/observability/compaction.jsonl  (+ full summaries alongside)
 *
 * Pure observer: never writes to stdout, always exits 0.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const OBS = process.env.CCOBS_DIR || path.join(homedir(), ".claude", "observability");
const LEDGER = path.join(OBS, "compaction.jsonl");
const SUMMARIES = path.join(OBS, "compactions");
const SECTIONS = ["参考真源", "Reference source", "Done means"];

// ---------------------------------------------------------------------------
// Python-fidelity helpers (behavior must match the .py original byte-for-byte)
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

// json.dumps(s, ensure_ascii=False): escape only ", \, and control chars.
function pyStr(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (cp < 0x20) out += "\\u" + cp.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

// json.dumps(row, ensure_ascii=False) with default separators (", ", ": ").
function pyDumps(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyStr(v);
  if (Array.isArray(v)) return "[" + v.map((x) => pyDumps(x)).join(", ") + "]";
  return (
    "{" +
    Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => pyStr(k) + ": " + pyDumps(x))
      .join(", ") +
    "}"
  );
}

// ---------------------------------------------------------------------------
// Plan anchors
// ---------------------------------------------------------------------------

function liveGoals(cwd: string): string[] {
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
    .slice(0, 2);
}

function anchorsOf(goal: string): string[] {
  // Concrete strings whose absence from a summary is a real loss.
  const found: string[] = [];
  let on = false;
  for (const line of readFileSync(goal, "utf-8").split(/\r\n?|\n/)) {
    if (line.startsWith("## ")) {
      const low = line.toLowerCase();
      on = SECTIONS.some((s) => low.includes(s.toLowerCase()));
      continue;
    }
    if (!on) continue;
    // in-repo paths and idents are the checkable atoms; prose is not
    for (const m of line.matchAll(/[\w./-]+\.(?:html|md|json|yaml|png|pdf)/g)) found.push(m[0]);
    for (const m of line.matchAll(/\b[A-Z]{2}[A-Z0-9]{4}\b/g)) found.push(m[0]);
  }
  const parent = path.posix.dirname(goal);
  found.push(path.posix.basename(parent)); // the plan slug itself
  if (isFile(path.posix.join(parent, "prototype.html"))) found.push("prototype.html");
  return [...new Set(found)].filter((f) => [...f].length > 3).sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const payload = JSON.parse(readFileSync(0, "utf-8")) as Record<string, unknown>;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;

  const summary = typeof payload.compact_summary === "string" ? payload.compact_summary : "";
  const cwd = pyPath(String(payload.cwd || "."));
  const sid = String(payload.session_id || "unknown");
  // datetime.now(timezone.utc).isoformat(timespec="seconds")
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");

  const goals = liveGoals(cwd);
  if (!goals.length && !summary) return; // nothing to say

  mkdirSync(SUMMARIES, { recursive: true });
  const stamp = now.replaceAll(":", "").replaceAll("-", "");
  const dump = path.join(SUMMARIES, `${sid}-${stamp}.md`);
  if (summary) writeFileSync(dump, summary);

  // a bare filename in the summary still counts as carried over
  const kept = (a: string) => summary.includes(a) || summary.includes(path.posix.basename(a));

  const plans = goals.map((g) => {
    const anchors = anchorsOf(g);
    return {
      goal: g,
      dropped: anchors.filter((a) => !kept(a)),
      survived: anchors.filter((a) => kept(a)),
    };
  });

  const row = {
    ts: now,
    session_id: sid,
    trigger: payload.trigger ?? null,
    cwd,
    summary_chars: [...summary].length,
    summary_file: summary ? dump : null,
    plans,
  };
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  appendFileSync(LEDGER, pyDumps(row) + "\n");
}

try {
  run();
} catch {
  // fail-open: pure observer, any exception → silent exit 0
}
process.exit(0);
