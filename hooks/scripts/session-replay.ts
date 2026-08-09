#!/usr/bin/env bun
/**
 * SessionStart hook: replay recent learned rules + announce the [LEARN] convention.
 *
 * Plain stdout + exit 0 == injected into Claude's context (canonical for
 * context-only SessionStart hooks). Reads the last entries of the project's
 * .claude/LEARNED.md (written by learn-capture.ts). Always exits 0.
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const MAX_ENTRIES = 5;
const HEARTBEAT = path.join(homedir(), ".claude", "observability", "distill.heartbeat");
const HEARTBEAT_MAX_AGE_H = 48; // distill 每小时跑;超 48h 未跳 = 管线死了(07-22 静默死两周的学费)

const CONVENTION =
  "When the user corrects how you work, or you discover a durable project rule " +
  "mid-task, emit a single line `[LEARN] <type>: <rule>` in your reply — a Stop " +
  "hook persists it to .claude/LEARNED.md; /debrief graduates entries into memory.";

// ---------------------------------------------------------------------------
// Python-fidelity helpers
// ---------------------------------------------------------------------------

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
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const payload = JSON.parse(readFileSync(0, "utf-8")) as Record<string, unknown>;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
  if (payload.source === "compact") return; // context survives compaction; don't re-inject
  const cwd = String(payload.cwd || ".");
  const learned = path.join(cwd, ".claude", "LEARNED.md");

  print(`<learn-convention>${CONVENTION}</learn-convention>`);
  if (isFile(HEARTBEAT)) {
    const ageH = (Date.now() - statSync(HEARTBEAT).mtimeMs) / 3_600_000;
    if (ageH > HEARTBEAT_MAX_AGE_H) {
      print(
        `<pipeline-alarm>ccobs distill heartbeat is ${ageH.toFixed(0)}h old ` +
        `(threshold ${HEARTBEAT_MAX_AGE_H}h) — the distillation pipeline is likely dead. ` +
        "Tell the user; check ~/.claude/observability/ingest.log and launchd job " +
        "com.vito.ccobs.ingest.</pipeline-alarm>",
      );
    }
  }
  if (isFile(learned)) {
    const entries = readFileSync(learned, "utf-8")
      .split(/\r\n?|\n/)
      .filter((l) => l.startsWith("- "));
    if (entries.length) {
      print("<learned-rules>");
      print("Recent project rules captured from past sessions (raw inbox, may be ungroomed):");
      for (const line of entries.slice(-MAX_ENTRIES)) print(line);
      print("</learned-rules>");
    }
  }
}

try {
  run();
} catch {
  // fail-open: any exception → silent exit 0
}
process.exit(0);
