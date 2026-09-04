#!/usr/bin/env bun
// debrief Move 2d: one number that says whether the collaboration is getting
// smoother — user corrections per distilled session, this ISO week vs last.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { OBS_DIR } from "./rules-digest.ts";

const db = join(OBS_DIR, "obs.db");
if (!existsSync(db)) { console.log("摩擦: 无 obs.db"); process.exit(0); }
const rows = new Database(db, { readonly: true }).prepare(
  `SELECT strftime('%Y-W%W', s.started_at) AS wk, COUNT(*) AS n, ROUND(AVG(o.corrections), 2) AS c
   FROM observations o JOIN sessions s ON s.session_id = o.session_id
   WHERE o.task_type IS NOT NULL AND s.kind = 'main' AND s.started_at > date('now', '-21 days')
   GROUP BY wk ORDER BY wk DESC LIMIT 2`,
).all() as { wk: string; n: number; c: number }[];
const [cur, prev] = rows;
if (!cur) { console.log("摩擦: 本周无蒸馏会话"); process.exit(0); }
const trend = prev ? (cur.c > prev.c ? " ↑" : cur.c < prev.c ? " ↓" : " →") : "";
console.log(`摩擦: 本周 ${cur.c}/场 (${cur.n} 场)${prev ? ` vs 上周 ${prev.c}/场 (${prev.n} 场)` : ""}${trend}`);
