#!/usr/bin/env bun
/**
 * Evidence for hooks that inject text: of the sessions a hook fired in, how many
 * then did what the text asked. Mined from Claude Code transcripts, where every
 * injection is an `attachment` record, so the hooks themselves log nothing extra.
 *
 *   bun inject-evidence.ts [--days 30] [--json]
 *
 * Followed in under MIN_RATE of the sessions it fired in: no evidence, remove.
 * Fired in fewer than MIN_FIRED sessions: too thin to judge, look again later.
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MIN_FIRED = 20;
export const MIN_RATE = 0.1; // conventions that only apply when something comes up sit near 15%

type Turn = { text: string; tools: string };
type Hook = { name: string; fired: (injected: string) => boolean; followed: (t: Turn, injected: string) => boolean };

const listed = (injected: string, re: RegExp) => [...injected.matchAll(re)].map((m) => m[1]);

export const HOOKS: Hook[] = [
  { name: "understand", fired: (s) => s.includes("<understand-first>"), followed: (t) => t.text.includes("【理解】目标") },
  { name: "plan-split", fired: (s) => s.includes("写一行 `拆分：`"), followed: (t) => /^拆分[：:]/m.test(t.text) },
  {
    // followed = the agent opened or queried one of the sessions it was handed
    name: "recall-precedent",
    fired: (s) => s.includes("<session-precedents>"),
    followed: (t, s) => listed(s, /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{20,})\b/g).some((sid) => t.tools.includes(sid)),
  },
  // session-replay carries two conventions; each is judged on its own
  { name: "session-replay/todo", fired: (s) => s.includes("<todo-convention>"), followed: (t) => t.tools.includes("todo.ts") },
  { name: "session-replay/learn", fired: (s) => s.includes("<learn-convention>"), followed: (t) => /^\[LEARN\]/m.test(t.text) },
  {
    // followed = the agent went back to the plan directory after compaction
    name: "plan-anchor",
    // an anchor with no plan body under it injected nothing and does not count as fired
    fired: (s) => /<plan-anchor>[\s\S]*\n### /.test(s),
    followed: (t, s) => listed(s, /\((\/[^)\n]+)\/goal\.md\)/g).some((dir) => t.tools.includes(dir)),
  },
];

/** hook name → did a later assistant turn follow it; absent = never fired in this transcript. */
export function scan(transcript: string): Map<string, boolean> {
  const live = new Map<Hook, string>();
  const out = new Map<string, boolean>();
  for (const line of transcript.split("\n")) {
    const kind = line.includes('"type":"attachment"') ? "attachment" : line.includes('"type":"assistant"') ? "assistant" : "";
    if (!kind || (kind === "assistant" && !live.size)) continue;
    let j: any;
    try { j = JSON.parse(line); } catch { continue; }
    if (j.type === "attachment") {
      const injected = strings(j.attachment).join("\n");
      for (const h of HOOKS) if (!out.has(h.name) && h.fired(injected)) { out.set(h.name, false); live.set(h, injected); }
    } else if (j.type === "assistant" && Array.isArray(j.message?.content)) {
      const turn: Turn = { text: "", tools: "" };
      for (const c of j.message.content) {
        if (c.type === "text") turn.text += `${c.text}\n`;
        else if (c.type === "tool_use") turn.tools += `${JSON.stringify(c.input)}\n`;
      }
      for (const [h, injected] of live) if (h.followed(turn, injected)) { out.set(h.name, true); live.delete(h); }
    }
  }
  return out;
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

/** thin = too few sessions to judge; look again next window. */
export function verdict(fired: number, followed: number): "keep" | "remove" | "thin" {
  if (fired < MIN_FIRED) return "thin";
  return followed / fired >= MIN_RATE ? "keep" : "remove";
}

if (import.meta.main) {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const days = Number(arg("--days") ?? 30);
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  const since = Date.now() - days * 864e5;
  const tally = new Map(HOOKS.map((h) => [h.name, { fired: 0, followed: 0 }]));
  for (const f of new Bun.Glob("*/*.jsonl").scanSync(root)) {
    const p = join(root, f);
    if (statSync(p).mtimeMs < since) continue;
    for (const [name, ok] of scan(readFileSync(p, "utf8"))) {
      const t = tally.get(name)!;
      t.fired++;
      if (ok) t.followed++;
    }
  }
  const rows = [...tally].map(([hook, t]) => ({ hook, ...t, rate: t.fired ? Number((t.followed / t.fired).toFixed(2)) : 0, verdict: verdict(t.fired, t.followed) }));
  if (process.argv.includes("--json")) console.log(JSON.stringify({ days, min_fired: MIN_FIRED, min_rate: MIN_RATE, rows }));
  else {
    console.log(`inject evidence · last ${days}d · keep = followed ≥${MIN_RATE * 100}% · thin = fired <${MIN_FIRED}`);
    for (const r of rows) console.log(`${r.hook.padEnd(21)} fired ${String(r.fired).padStart(4)}  followed ${String(r.followed).padStart(4)}  ${String(Math.round(r.rate * 100)).padStart(3)}%  ${r.verdict}`);
  }
}
