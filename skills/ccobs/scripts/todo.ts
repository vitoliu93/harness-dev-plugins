#!/usr/bin/env bun
// Open-loop ledger: problems an agent found but did not handle in the session.
// Two writers share one table: an agent mid-task (`add`, source=inline) and the
// hourly distill (todo_candidates, source=distill). The daily todo-review reads it.
//
//   bun todo.ts add --title "<一句话>" --why "<为什么是问题>" --evidence "<文件:行/日志/issue>" [--project <dir>] [--session <id>]
//   bun todo.ts list [--project <dir>] [--all] [--json]
//   bun todo.ts close <id> [--by <commit/issue/说明>]
//   bun todo.ts dismiss <id>
//   bun todo.ts reopen <id>          # undo an automatic close
//
// Closing is meant to be passive: distill closes items a later session resolved,
// todo-review expires stale ones, an agent that fixes one closes it. The user
// only reopens what was closed wrongly.

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { OBS_DIR } from "./rules-digest.ts";

export const TODO_DDL = `CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  why TEXT,
  evidence TEXT,
  project TEXT,
  source TEXT NOT NULL,          -- inline | distill
  source_session TEXT,
  dedupe_key TEXT NOT NULL,      -- project + normalized title
  status TEXT NOT NULL DEFAULT 'open', -- open | done | dismissed | superseded
  created_at TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT                 -- user | evidence:<...> | merge:<id>
);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status, project);
CREATE INDEX IF NOT EXISTS idx_todos_key ON todos(dedupe_key);`;

export type Todo = { title: string; why?: string; evidence?: string; project?: string | null; source: "inline" | "distill"; session?: string | null };

export function openDb(path = join(OBS_DIR, "obs.db")): Database {
  const db = new Database(path);
  db.exec("PRAGMA busy_timeout = 5000"); // agents' `add` races the hourly distill
  db.exec(TODO_DDL);
  return db;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
export const dedupeKey = (project: string | null | undefined, title: string) => `${project ?? ""}|${norm(title)}`;

/** Returns the new id, or null when an open twin exists or this session already filed it (distill reruns stay idempotent). */
export function addTodo(db: Database, t: Todo): string | null {
  const title = t.title.trim().slice(0, 200);
  if (!title) return null;
  const key = dedupeKey(t.project, title);
  return db.transaction(() => {
    const dup = db.query(`SELECT id FROM todos WHERE dedupe_key = ? AND (status = 'open' OR (source_session IS NOT NULL AND source_session = ?)) LIMIT 1`).get(key, t.session ?? null);
    if (dup) return null;
    const id = "t-" + crypto.randomUUID().slice(0, 8);
    db.query(`INSERT INTO todos (id, title, why, evidence, project, source, source_session, dedupe_key, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, title, t.why?.slice(0, 500) ?? null, t.evidence?.slice(0, 500) ?? null, t.project ?? null, t.source, t.session ?? null, key, new Date().toISOString());
    return id;
  })();
}

export function reopenTodo(db: Database, id: string): boolean {
  return db.query(`UPDATE todos SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = ? AND status != 'open'`).run(id).changes > 0;
}

export function openTodos(db: Database, project: string | null, limit = 30): { id: string; title: string; evidence: string | null; created_at: string }[] {
  return db.query(`SELECT id, title, evidence, created_at FROM todos WHERE status = 'open' AND project IS ? ORDER BY created_at DESC LIMIT ?`).all(project, limit) as any[];
}

export function closeTodo(db: Database, id: string, status: "done" | "dismissed" | "superseded", by: string): boolean {
  return db.query(`UPDATE todos SET status = ?, closed_at = ?, closed_by = ? WHERE id = ? AND status = 'open'`).run(status, new Date().toISOString(), by, id).changes > 0;
}

export function gitRoot(dir: string): string {
  const r = Bun.spawnSync(["git", "-C", dir, "rev-parse", "--show-toplevel"]);
  return r.exitCode === 0 ? r.stdout.toString().trim() : dir;
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (n: string) => { const i = rest.indexOf(n); return i === -1 ? undefined : rest[i + 1]; };
  const db = openDb();
  if (cmd === "add") {
    const title = opt("--title");
    if (!title) { console.error("todo add: --title is required"); process.exit(1); }
    const id = addTodo(db, { title, why: opt("--why"), evidence: opt("--evidence"), project: opt("--project") ?? gitRoot(process.cwd()), source: "inline", session: opt("--session") ?? null });
    console.log(id ? `todo: added ${id}` : "todo: already open, skipped");
  } else if (cmd === "list") {
    const project = opt("--project");
    const rows = db.query(`SELECT id, status, title, why, evidence, project, created_at FROM todos WHERE (?1 IS NULL OR project = ?1) AND (?2 OR status = 'open') ORDER BY created_at DESC LIMIT 200`)
      .all(project ?? null, rest.includes("--all") ? 1 : 0) as any[];
    if (rest.includes("--json")) console.log(JSON.stringify(rows));
    else for (const r of rows) console.log(`${r.id} [${r.status}] ${r.title}${r.evidence ? `  ← ${r.evidence}` : ""}`);
  } else if ((cmd === "close" || cmd === "dismiss") && rest[0]) {
    const ok = closeTodo(db, rest[0], cmd === "close" ? "done" : "dismissed", opt("--by") ? `evidence:${opt("--by")}` : "user");
    console.log(ok ? `todo: ${cmd}d ${rest[0]}` : `todo: ${rest[0]} not open`);
  } else if (cmd === "reopen" && rest[0]) {
    console.log(reopenTodo(db, rest[0]) ? `todo: reopened ${rest[0]}` : `todo: ${rest[0]} already open or unknown`);
  } else {
    console.error("usage: todo.ts add --title <t> [--why] [--evidence] [--project] [--session] | list [--project] [--all] [--json] | close <id> [--by] | dismiss <id> | reopen <id>");
    process.exit(1);
  }
}
