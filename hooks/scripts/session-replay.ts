#!/usr/bin/env bun
/**
 * SessionStart hook: replay the rolled-up rules for this project + the last
 * LEARNED.md entries + announce the [LEARN] convention.
 *
 * Plain stdout + exit 0 == injected into context. Verified on both clients:
 * Codex ignores `hookSpecificOutput.additionalContext` here and only picks up
 * plain stdout, so never switch this to JSON.
 *
 * Zero model calls — the digest under ~/.claude/observability/rules/ is built
 * ahead of time by `ccobs/scripts/rollup.ts` on the launchd schedule.
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

import { topRules } from "../../skills/ccobs/scripts/rules-digest.ts";

const MAX_ENTRIES = 5;
const MAX_PROJECT_RULES = 12;
const MAX_GLOBAL_RULES = 6;
const HEARTBEAT = path.join(homedir(), ".claude", "observability", "distill.heartbeat");
const HEARTBEAT_MAX_AGE_H = 48; // distill 每小时跑;超 48h 未跳 = 管线死了(07-22 静默死两周的学费)

const CONVENTION =
  "When the user corrects how you work, or you discover a durable project rule " +
  "mid-task, emit a single line `[LEARN] <type>: <rule>` in your reply — a Stop " +
  "hook persists it to .claude/LEARNED.md; ccobs rolls it up into the digest below.";

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
  try {
    const { project, global } = topRules(cwd, MAX_PROJECT_RULES);
    if (project.length || global.length) {
      print("<rolled-up-rules>");
      print(
        "Rules distilled from past sessions across every client (Claude Code, Codex, ...). " +
        "×N is how often it recurred, so it is confidence, not proof — a rule can still be stale. " +
        "If one turns out wrong today, /debrief edits the digest under ~/.claude/observability/rules/.",
      );
      for (const r of project) print(`- ${r.text} ×${r.count} (${r.last})`);
      for (const r of global.slice(0, MAX_GLOBAL_RULES)) print(`- [全局] ${r.text} ×${r.count} (${r.last})`);
      print("</rolled-up-rules>");
    }
  } catch {
    // digest missing or malformed: the rest of the replay still runs
  }
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
