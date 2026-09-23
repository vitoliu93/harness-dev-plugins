#!/usr/bin/env bun
/** Read-only adapter: SQLite is unavailable inside the Mod environment. No model calls. */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// This optional Mod ships inside dev-kit; reuse its canonical project encoding.
import { bigrams, projectKey } from "../../../skills/ccobs/scripts/rules-digest.ts";

type Row = { session_id: string; day: string; summary: string; conclusion: string; files: string | null; file_path: string };
export function candidates(dbPath: string, cwd: string, query: string, session: string): Row[] {
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.query(`SELECT o.session_id, substr(s.ended_at,1,10) AS day,
      substr(o.summary,1,2000) AS summary, substr(coalesce(o.conclusion,''),1,2000) AS conclusion, o.files, substr(s.file_path,1,1200) AS file_path
      FROM observations o JOIN sessions s ON s.session_id=o.session_id
      WHERE s.project=? AND o.session_id<>? AND o.summary IS NOT NULL AND o.summary<>''
        AND s.ended_at>strftime('%Y-%m-%dT%H:%M:%S','now','-90 days')
      ORDER BY s.ended_at DESC LIMIT 400`).all(projectKey(cwd), session) as Row[];
    const q = bigrams(query.slice(0, 6000));
    const ranked = rows.map(r => ({r,score:[...bigrams(`${r.summary} ${r.conclusion}`)].filter(g=>q.has(g)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    const picked = new Map<string, Row>();
    for (const {r} of ranked.slice(0, 20)) picked.set(r.session_id, r);
    for (const r of rows.slice(0, 8)) { if (picked.size >= 24) break; picked.set(r.session_id, r); }
    return [...picked.values()].map(r => ({ ...r, summary: r.summary.slice(0, 200), conclusion: r.conclusion.slice(0, 240) }));
  } finally { db.close(); }
}
if (import.meta.main) {
  try {
    const input = await Bun.stdin.text();
    if (input.length > 20_000) throw new Error("input-too-large");
    const {cwd,query,session} = JSON.parse(input);
    if (typeof cwd !== "string" || typeof query !== "string" || typeof session !== "string") throw new Error("bad-input");
    const root = process.env.CCOBS_DIR || join(homedir(), ".claude", "observability");
    console.log(JSON.stringify(candidates(join(root,"obs.db"),cwd,query,session)));
  } catch { console.error("recall-candidates: unavailable"); process.exitCode = 1; }
}
