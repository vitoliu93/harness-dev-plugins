#!/usr/bin/env bun
/**
 * Stop hook: persist [LEARN] markers from the session transcript.
 *
 * The model emits `[LEARN] <type>: <rule>` inline while working (convention is
 * injected by session-replay.ts at SessionStart). This hook greps the transcript
 * for those markers and appends new ones to <cwd>/.claude/LEARNED.md — the raw
 * learning inbox that /debrief later graduates into curated memory.
 *
 * Pure observer contract: always exit 0, never emit decision/additionalContext
 * (either would keep the conversation looping). Any failure → exit 0 silently.
 */

import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

const MARKER = /\[LEARN\]\s*([a-z一-鿿-]+)?\s*[::]\s*(.+)/gi;
const HEADER = "# LEARNED — raw inbox (auto-captured by learn-capture hook; graduate via /debrief)\n";

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

// date.today() — local date, YYYY-MM-DD
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Transcript scan
// ---------------------------------------------------------------------------

function* assistantTexts(transcript: string): Generator<string> {
  for (const line of readFileSync(transcript, "utf-8").split("\n")) {
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    // Python: a parsed non-dict line raises AttributeError on .get → whole run
    // dies silently (fail-open). Replicated by throwing to the top-level catch.
    if (o === null || typeof o !== "object" || Array.isArray(o)) {
      throw new Error("non-dict transcript line");
    }
    const rec = o as Record<string, unknown>;
    if (rec.type !== "assistant") continue;
    const msg = "message" in rec ? rec.message : {};
    if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
      throw new Error("non-dict message");
    }
    const content = (msg as Record<string, unknown>).content;
    if (typeof content === "string") {
      yield content;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === "object" && !Array.isArray(block)) {
          const b = block as Record<string, unknown>;
          if (b.type === "text") yield typeof b.text === "string" ? b.text : "";
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const payload = JSON.parse(readFileSync(0, "utf-8")) as Record<string, unknown>;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
  // Python: payload["transcript_path"] — missing key raises → silent exit 0
  if (typeof payload.transcript_path !== "string") return;
  const transcript = payload.transcript_path;
  const cwd = String(payload.cwd || ".");
  if (!isFile(transcript)) return;

  const found: Array<[string, string]> = [];
  for (const text of assistantTexts(transcript)) {
    for (const m of text.matchAll(MARKER)) {
      // .strip().rstrip("`*").strip()
      const rule = m[2].trim().replace(/[`*]+$/, "").trim();
      if (rule) found.push([m[1] || "rule", rule]);
    }
  }
  if (!found.length) return;

  const target = path.join(cwd, ".claude", "LEARNED.md");
  const existing = isFile(target) ? readFileSync(target, "utf-8") : "";
  const fresh = found.filter(([, r]) => !existing.includes(r));
  if (!fresh.length) return;

  mkdirSync(path.dirname(target), { recursive: true });
  let out = existing ? "" : HEADER;
  const today = localToday();
  for (const [t, r] of fresh) out += `- ${today} [${t.toLowerCase()}] ${r}\n`;
  appendFileSync(target, out);
}

try {
  run();
} catch {
  // fail-open: pure observer, any exception → silent exit 0
}
process.exit(0);
