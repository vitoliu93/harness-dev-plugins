#!/usr/bin/env bun
// debrief Move 2c: did this session actually open the precedents recall injected?
// Appends one `mark` line to recall.jsonl next to the `inject` line, so hit rate
// is a grep, not a transcript dig. Usage: recall-mark.ts <session_id> <transcript.jsonl>

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OBS_DIR } from "./rules-digest.ts";

const LEDGER = join(OBS_DIR, "recall.jsonl");

/** Precedent ids the assistant referred to in a tool call (Read/cat/grep of the transcript, or a ccobs query). */
export function usedIds(picked: string[], transcriptLines: string[]): string[] {
  const seen = new Set<string>();
  for (const line of transcriptLines) {
    if (!line.includes('"tool_use"')) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "assistant") continue;
    const s = JSON.stringify(e.message?.content ?? "");
    for (const id of picked) if (s.includes(id.slice(0, 8))) seen.add(id);
  }
  return picked.filter((id) => seen.has(id));
}

if (import.meta.main) {
  const [sid, transcript] = process.argv.slice(2);
  if (!sid || !transcript) { console.log("usage: recall-mark.ts <session_id> <transcript.jsonl>"); process.exit(0); }
  if (!existsSync(LEDGER)) { console.log("先例: 无台账"); process.exit(0); }
  const inject = readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && r.session_id === sid && r.verdict === "inject").pop();
  if (!inject) { console.log("先例: 本会话无注入"); process.exit(0); }
  const lines = existsSync(transcript) ? readFileSync(transcript, "utf8").split("\n") : [];
  const used = usedIds(inject.picked ?? [], lines);
  const unused = (inject.picked ?? []).filter((id: string) => !used.includes(id));
  appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), session_id: sid, verdict: "mark", used, unused }) + "\n");
  console.log(`先例: 用了 ${used.length}/${inject.picked?.length ?? 0}`);
}
