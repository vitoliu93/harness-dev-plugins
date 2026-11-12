#!/usr/bin/env bun
// Open-loop ledger: problems an agent found but did not handle in the session.
// Two writers share one table: an agent mid-task (`add`, source=inline) and the
// hourly distill (todo_candidates, source=distill). The daily todo-review reads it.
//
// Only work an agent can finish alone goes in; steps that need the user's hands,
// accounts or decision do not.
//
//   bun todo.ts add --title "<一句话>" --why "<为什么是问题>" --evidence "<仓内文件:行/提交/Gitee 单号>" [--repo <仓名>] [--project <dir>] [--session <id>]
//   bun todo.ts list [--project <dir>] [--all] [--json]
//   bun todo.ts close <id> [--by <commit/issue/说明>]
//   bun todo.ts dismiss <id>
//   bun todo.ts claim <id>           # this session is working it; autopilot skips it for 3 days
//   bun todo.ts reopen <id>          # undo an automatic close
//   bun todo.ts check                # open items whose named files were committed to since they were found
//   bun todo.ts decisions            # items waiting for the user's call
//   bun todo.ts decide <id> <n|dismiss>
//
// Closing is meant to be passive: distill closes items a later session resolved,
// todo-review expires stale ones, an agent that fixes one closes it. The user
// only reopens what was closed wrongly.

import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
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
  status TEXT NOT NULL DEFAULT 'open', -- open | decision | done | dismissed | superseded
  created_at TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT                 -- user | evidence:<...> | merge:<id>
);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status, project);
CREATE INDEX IF NOT EXISTS idx_todos_key ON todos(dedupe_key);
CREATE TABLE IF NOT EXISTS cwd_roots (cwd TEXT PRIMARY KEY, root TEXT NOT NULL); -- worktree → main checkout, seen while it existed
CREATE TABLE IF NOT EXISTS todo_events (todo_id TEXT NOT NULL, at TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, by TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS idx_todo_events ON todo_events(todo_id, at);
CREATE TABLE IF NOT EXISTS todo_rejects (at TEXT NOT NULL, reason TEXT NOT NULL, title TEXT, project TEXT, source TEXT);`;

/** Idempotent; distill and the CLI both open the ledger. */
export function migrateTodos(db: Database): void {
  db.exec(TODO_DDL);
  const have = new Set((db.query(`PRAGMA table_info(todos)`).all() as { name: string }[]).map((c) => c.name));
  for (const col of ["repo", "decision", "run_id"]) if (!have.has(col)) try { db.exec(`ALTER TABLE todos ADD COLUMN ${col} TEXT`); } catch {} // another process added it first
}

export type Todo = { title: string; why?: string; evidence?: string; project?: string | null; repo?: string | null; source: "inline" | "distill"; session?: string | null };

export function openDb(path = join(OBS_DIR, "obs.db")): Database {
  const db = new Database(path);
  db.exec("PRAGMA busy_timeout = 5000"); // agents' `add` races the hourly distill
  migrateTodos(db);
  return db;
}

// One line, no angle brackets: titles come from models and get injected back into context.
export const flat = (s: string | undefined, max: number) => s ? s.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, max) : undefined;
const DISMISS_MEMORY_DAYS = 30;
/** Open items per project before every surface warns. Warn, never refuse: a refused finding is lost. */
export const TODO_CAP = 20;
const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
export const dedupeKey = (project: string | null | undefined, title: string) => `${project ?? ""}|${norm(title)}`;

/** Returns the new id, or null when an open twin exists or this session already filed it (distill reruns stay idempotent). */
export function addTodo(db: Database, t: Todo): string | null {
  const title = flat(t.title, 200) ?? "";
  if (!title) return null;
  const key = dedupeKey(t.project, title);
  return db.transaction(() => {
    // A dismissed item stays dismissed for a while; a done one may come back (fixed, then broke again).
    const dup = db.query(`SELECT id FROM todos WHERE dedupe_key = ?1 AND (status = 'open' OR (source_session IS NOT NULL AND source_session = ?2)
      OR (status = 'dismissed' AND closed_at >= ?3)) LIMIT 1`).get(key, t.session ?? null, new Date(Date.now() - DISMISS_MEMORY_DAYS * 86_400_000).toISOString());
    if (dup) return null;
    const id = "t-" + crypto.randomUUID().slice(0, 8);
    db.query(`INSERT INTO todos (id, title, why, evidence, project, repo, source, source_session, dedupe_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, title, flat(t.why, 500) ?? null, flat(t.evidence, 500) ?? null, t.project ?? null, t.repo ?? null, t.source, t.session ?? null, key, new Date().toISOString());
    logEvent(db, id, null, "open", t.source);
    return id;
  }).immediate(); // take the write lock up front: a read-to-write upgrade skips busy_timeout
}

export function logEvent(db: Database, id: string, from: string | null, to: string, by?: string | null, note?: string | null): void {
  db.query(`INSERT INTO todo_events (todo_id, at, from_status, to_status, by, note) VALUES (?,?,?,?,?,?)`).run(id, new Date().toISOString(), from, to, by ?? null, note ?? null);
}

export function reopenTodo(db: Database, id: string): boolean {
  const r = db.query(`SELECT status, closed_by FROM todos WHERE id = ?`).get(id) as { status: string; closed_by: string | null } | null;
  if (!r || r.status === "open") return false;
  db.query(`UPDATE todos SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = ?`).run(id);
  logEvent(db, id, r.status, "open", "reopen", r.closed_by);
  return true;
}

const repoRoots = () => (process.env.TODO_REPO_ROOTS ?? `${homedir()}/codebase/icc/kox-base:${homedir()}/codebase/projects`).split(":");

/** Main checkouts under the workspace roots, by directory name. A linked worktree has a .git file, so it is skipped. */
export function knownRepos(): Map<string, string> {
  const out = new Map<string, string>();
  for (const root of repoRoots()) {
    let names: string[] = [];
    try { names = readdirSync(root); } catch { continue; }
    for (const n of names) if (!out.has(n) && isGitDir(join(root, n, ".git"))) out.set(n, join(root, n));
  }
  return out;
}
const isGitDir = (p: string) => existsSync(join(p, "HEAD"));

/** Named repo wins: a session in repo A can file against repo B. A workspace root that is not a repo needs the name. */
export function resolveRepo(project: string | null | undefined, name?: string | null): string | null {
  if (name) return knownRepos().get(name) ?? null;
  return project && isGitDir(join(project, ".git")) ? project : null;
}

const TEMP_PATH = /(?<![\w.-])(?:\/private)?\/(?:tmp|var\/folders)\/[^\s；;,，、）)|]*/g;
const lsCache = new Map<string, string[]>();
function repoFiles(repo: string): string[] {
  let files = lsCache.get(repo);
  if (!files) {
    const r = Bun.spawnSync(["git", "-C", repo, "ls-files"]);
    files = r.exitCode === 0 ? r.stdout.toString().split("\n").filter(Boolean) : [];
    lsCache.set(repo, files);
  }
  return files;
}
const isCommit = (repo: string, h: string) => Bun.spawnSync(["git", "-C", repo, "cat-file", "-e", `${h}^{commit}`]).exitCode === 0;

function hasAnchor(repo: string, text: string): boolean {
  if (/\bIK[A-Z0-9]{4,8}\b/.test(text)) return true;
  if ((text.match(/\b[0-9a-f]{7,40}\b/g) ?? []).some((h) => isCommit(repo, h))) return true;
  const name = repo.split("/").pop()!;
  const files = repoFiles(repo);
  for (const raw of text.match(/[\w@+-]*[./][\w@.\/+-]*/g) ?? []) {
    let tok = raw.replace(/^\.\//, "").replace(/[./]+$/, "");
    if (tok.startsWith("/")) { if (files.some((f) => tok.endsWith("/" + f))) return true; continue; } // an absolute path, often from a worktree
    if (tok.startsWith(name + "/")) tok = tok.slice(name.length + 1);
    if (tok.length < 3) continue;
    if (files.some((f) => f === tok || f.endsWith("/" + tok) || f.startsWith(tok + "/"))) return true;
  }
  return false;
}

/** The evidence without temp paths, or the reason it cannot be filed. An anchor has to outlive the session that found it. */
export function checkEvidence(repo: string, evidence: string | undefined): { evidence: string } | { reject: "temp-evidence" | "no-anchor" } {
  const raw = evidence ?? "";
  const clean = raw.replace(TEMP_PATH, " ").replace(/\s+/g, " ").replace(/^[\s；;,，、]+|[\s；;,，、]+$/g, "");
  if (hasAnchor(repo, clean)) return { evidence: clean };
  return { reject: clean === raw.trim() ? "no-anchor" : "temp-evidence" };
}

export type Filed = { id: string } | { dup: true } | { rejected: string };

/** The one way into the ledger: no repo or no lasting evidence, no record. Rejections are counted for the morning report. */
export function fileTodo(db: Database, t: Todo & { repoName?: string | null }): Filed {
  const reject = (reason: string): Filed => {
    db.query(`INSERT INTO todo_rejects (at, reason, title, project, source) VALUES (?,?,?,?,?)`).run(new Date().toISOString(), reason, flat(t.title, 200) ?? "", t.project ?? null, t.source);
    return { rejected: reason };
  };
  const repo = resolveRepo(t.project, t.repoName);
  if (!repo) return reject(t.repoName ? `unknown-repo:${flat(t.repoName, 40)}` : "no-repo");
  const c = checkEvidence(repo, t.evidence);
  if ("reject" in c) return reject(c.reject);
  const id = addTodo(db, { ...t, repo, evidence: c.evidence });
  return id ? { id } : { dup: true };
}

export type Decision = { kind: "decide" | "risk"; question: string; background: string; options: string[]; if_ignored: string; asked_at?: string; answer?: string };
const DECISION_EXPIRE_DAYS = 14;

export function askDecision(db: Database, id: string, d: Decision): boolean {
  const ok = db.query(`UPDATE todos SET status = 'decision', decision = ?, run_id = NULL WHERE id = ? AND status = 'open'`).run(JSON.stringify({ ...d, asked_at: new Date().toISOString() }), id).changes > 0;
  if (ok) logEvent(db, id, "open", "decision", d.kind, d.question);
  return ok;
}

export function listDecisions(db: Database): { id: string; title: string; repo: string | null; decision: Decision }[] {
  return (db.query(`SELECT id, title, repo, decision FROM todos WHERE status = 'decision' ORDER BY created_at`).all() as any[]).map((r) => ({ ...r, decision: JSON.parse(r.decision) }));
}

/** `choice`: 1-based option, or "dismiss". Answered items go back to open with the answer on them. */
export function decide(db: Database, id: string, choice: string): string {
  const r = db.query(`SELECT decision FROM todos WHERE id = ? AND status = 'decision'`).get(id) as { decision: string } | null;
  if (!r) return `${id} is not waiting for a decision`;
  if (choice === "dismiss") { closeTodo(db, id, "dismissed", "decision:dismiss"); return `dismissed ${id}`; }
  const d = JSON.parse(r.decision) as Decision;
  const answer = d.options[Number(choice) - 1];
  if (!answer) return `no option ${choice}; pick 1-${d.options.length} or dismiss`;
  db.query(`UPDATE todos SET status = 'open', decision = ? WHERE id = ?`).run(JSON.stringify({ ...d, answer }), id);
  logEvent(db, id, "decision", "open", "decide", answer);
  return `${id}: ${answer}`;
}

export function expireDecisions(db: Database, now = Date.now()): string[] {
  const cutoff = now - DECISION_EXPIRE_DAYS * 86_400_000;
  return listDecisions(db).filter((r) => Date.parse(r.decision.asked_at ?? "") < cutoff && closeTodo(db, r.id, "dismissed", "decision:expired")).map((r) => r.id);
}

// Same project, or one nested in the other: a non-git workspace, its sub-repos and the plan dirs
// under it share findings, because a fix lands wherever the work happened, not where it was filed.
const related = (p: string) => `(project IS ${p} OR ${p} LIKE project || '/%' OR project LIKE ${p} || '/%')`;
export const isRelated = (a: string | null, b: string | null) => a === b || (!!a && !!b && (a.startsWith(b + "/") || b.startsWith(a + "/")));

export function openTodos(db: Database, project: string | null, limit = 30): { id: string; title: string; evidence: string | null; created_at: string }[] {
  return db.query(`SELECT id, title, evidence, created_at FROM todos WHERE status = 'open' AND ${related("?1")} ORDER BY created_at DESC LIMIT ?2`).all(project, limit) as any[];
}

export function countOpen(db: Database, project: string | null): number {
  return (db.query(`SELECT COUNT(*) n FROM todos WHERE status = 'open' AND project IS ?`).get(project) as { n: number }).n;
}

/** Folds `drop` into `keep`: dropped titles and evidence survive in keep's evidence, so a merge loses no specifics. */
export function mergeTodos(db: Database, keep: string, drop: string[], title?: string): string[] {
  return db.transaction(() => {
    const k = db.query(`SELECT project, evidence FROM todos WHERE id = ? AND status = 'open'`).get(keep) as { project: string | null; evidence: string | null } | null;
    if (!k) return [];
    const done: string[] = [];
    const parts = k.evidence ? [k.evidence] : [];
    for (const d of drop) {
      const r = db.query(`SELECT title, evidence FROM todos WHERE id = ?2 AND status = 'open' AND ${related("?1")}`).get(k.project, d) as { title: string; evidence: string | null } | null;
      if (!r || d === keep || !closeTodo(db, d, "superseded", `merge:${keep}`)) continue;
      parts.push(`${r.title}${r.evidence ? ` ← ${r.evidence}` : ""}`);
      done.push(d);
    }
    const t = flat(title, 200);
    if (done.length) db.query(`UPDATE todos SET evidence = ?, title = COALESCE(?, title), dedupe_key = COALESCE(?, dedupe_key) WHERE id = ?`)
      .run(flat(parts.join("；"), 1000) ?? null, t ?? null, t ? dedupeKey(k.project, t) : null, keep);
    return done;
  }).immediate();
}

export function closeTodo(db: Database, id: string, status: "done" | "dismissed" | "superseded", by: string): boolean {
  return db.transaction(() => {
    const r = db.query(`SELECT status FROM todos WHERE id = ? AND status IN ('open', 'decision')`).get(id) as { status: string } | null;
    if (!r) return false;
    db.query(`UPDATE todos SET status = ?, closed_at = ?, closed_by = ? WHERE id = ?`).run(status, new Date().toISOString(), by, id);
    logEvent(db, id, r.status, status, by);
    return true;
  }).immediate();
}

/** Main checkout of the repo, so a worktree and its repo share one ledger key. */
export function gitRoot(dir: string): string {
  const r = Bun.spawnSync(["git", "-C", dir, "rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const common = r.exitCode === 0 ? r.stdout.toString().trim() : "";
  return common.endsWith("/.git") ? common.slice(0, -5) : dir;
}

/** Stop hook: remember where a worktree belongs while it still exists. Distill runs after it may be gone. */
export function rememberRoot(db: Database, cwd: string): void {
  const root = gitRoot(cwd);
  if (root !== cwd) db.query(`INSERT OR REPLACE INTO cwd_roots (cwd, root) VALUES (?, ?)`).run(cwd, root);
}

/** Ledger key for a session's cwd: the main checkout, even after the worktree was removed. */
/** Scratch dirs (/tmp, /private/tmp, /var/folders): nobody comes back to fix what was found there, so distill files nothing. */
/** Autopilot worktrees live under a directory with this name; findings there go in the receipt, not the ledger. */
export const AUTOPILOT_DIR = "/.autopilot/";

export const isTempProject = (p: string | null | undefined) => !!p && /^(\/private)?\/(tmp|var\/folders)(\/|$)/.test(p);

export function projectFor(db: Database, cwd: string | null): string | null {
  if (!cwd) return cwd;
  const seen = db.query(`SELECT root FROM cwd_roots WHERE cwd = ?`).get(cwd) as { root: string } | null;
  return seen ? seen.root : existsSync(cwd) ? gitRoot(cwd) : cwd;
}

const FILE_RE = /[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|py|sh|sql|json|ya?ml|toml|go|rs|md)\b/g;
const GENERIC = new Set(["README.md", "SKILL.md", "AGENTS.md", "CLAUDE.md", "package.json", "package-lock.json", "index.ts", "spec.md", "goal.md", "todo.md"]);
export const namedFiles = (s: string) => [...new Set(s.match(FILE_RE) ?? [])].filter((f) => !GENERIC.has(f));
type Commit = { hash: string; at: string; subject: string; files: Set<string> };

/** Repos worked in lately: where fixes for open items would land. */
export function recentRepos(db: Database, sinceIso: string): string[] {
  const cwds = db.query(`SELECT DISTINCT cwd FROM sessions WHERE cwd IS NOT NULL AND started_at >= ?`).all(sinceIso) as { cwd: string }[];
  return [...new Set(cwds.map((c) => projectFor(db, c.cwd)!))].filter((r) => r && existsSync(join(r, ".git")));
}

/**
 * Commits after an item was found that touch a file it names. Distill only closes what the user's own
 * later sessions show; this also sees teammates' commits, other clients' work, and fixes that landed
 * before distill filed the item. Candidates for a human check, never a close: a touched file is not a fix.
 * Oldest first: a fix tends to follow the finding. `--all` reads remote branches as of the last fetch.
 */
export function touchedSince(rows: { id: string; title: string; evidence: string | null; since: string }[], repos: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const want = rows.map((r) => ({ ...r, files: namedFiles(`${r.title} ${r.evidence ?? ""}`) })).filter((r) => r.files.length);
  if (!want.length) return out;
  const oldest = want.reduce((m, r) => (r.since < m ? r.since : m), want[0].since);
  for (const repo of repos) {
    const log = Bun.spawnSync(["git", "-C", repo, "log", "--all", `--since=${oldest}`, "--reverse", "--name-only", "--format=%x00%h%x09%cI%x09%s"]);
    if (log.exitCode !== 0) continue;
    const commits: Commit[] = log.stdout.toString().split("\0").slice(1).map((chunk) => {
      const [head, ...paths] = chunk.split("\n");
      const [hash, at, subject] = head.split("\t");
      return { hash, at: new Date(at).toISOString(), subject, files: new Set(paths.filter(Boolean).map((p) => p.split("/").pop()!)) };
    });
    const name = repo.split("/").pop();
    for (const r of want) {
      for (const c of commits) {
        if (c.at < r.since || !r.files.some((f) => c.files.has(f))) continue;
        const hits = out.get(r.id) ?? [];
        if (hits.length < 3) out.set(r.id, [...hits, `${name} ${c.hash} ${flat(c.subject, 60)}`]);
      }
    }
  }
  return out;
}

/** When an item was found: the end of the session it came from (fixes can land before distill files it), else its filing time. */
export function foundAt(db: Database): { id: string; title: string; evidence: string | null; project: string | null; since: string }[] {
  return db.query(`SELECT t.id, t.title, t.evidence, t.project, COALESCE(s.ended_at, t.created_at) since
    FROM todos t LEFT JOIN sessions s ON s.session_id = t.source_session WHERE t.status = 'open'`).all() as any[];
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (n: string) => { const i = rest.indexOf(n); return i === -1 ? undefined : rest[i + 1]; };
  try {
  const db = openDb();
  if (cmd === "add") {
    const title = opt("--title");
    if (!title) { console.error("todo add: --title is required"); process.exit(1); }
    if (process.cwd().includes(AUTOPILOT_DIR)) { console.error("todo add: autopilot agents put findings in the result file"); process.exit(1); }
    const project = opt("--project") ?? gitRoot(process.cwd());
    const filed = fileTodo(db, { title, why: opt("--why"), evidence: opt("--evidence"), project, repoName: opt("--repo"), source: "inline", session: opt("--session") ?? null });
    if ("rejected" in filed) {
      console.error(`todo add: rejected (${filed.rejected}). Name the repo with --repo <dir name>; evidence needs a file in that repo, a commit in it, or a Gitee id. Temp paths do not count.`);
      process.exit(1);
    }
    console.log("id" in filed ? `todo: added ${filed.id}` : "todo: already open, skipped");
    const n = countOpen(db, project);
    if (n > TODO_CAP) console.log(`todo: ${n} open, over the cap of ${TODO_CAP}; close what is resolved before adding more`);
  } else if (cmd === "list") {
    const project = opt("--project");
    const rows = db.query(`SELECT id, status, title, why, evidence, project, created_at FROM todos WHERE (?1 IS NULL OR project = ?1) AND (?2 OR status = 'open') ORDER BY created_at DESC LIMIT 200`)
      .all(project ?? null, rest.includes("--all") ? 1 : 0) as any[];
    if (rest.includes("--json")) console.log(JSON.stringify(rows));
    else for (const r of rows) console.log(`${r.id} [${r.status}] ${r.title}${r.evidence ? `  ← ${r.evidence}` : ""}`);
  } else if ((cmd === "close" || cmd === "dismiss") && rest[0]) {
    const ok = closeTodo(db, rest[0], cmd === "close" ? "done" : "dismissed", opt("--by") ? `evidence:${opt("--by")}` : "user");
    console.log(ok ? `todo: ${cmd === "close" ? "closed" : "dismissed"} ${rest[0]}` : `todo: ${rest[0]} not open`);
  } else if (cmd === "check") {
    const rows = foundAt(db);
    const hits = touchedSince(rows, recentRepos(db, new Date(Date.now() - 60 * 86_400_000).toISOString()));
    for (const r of rows) if (hits.has(r.id)) console.log(`${r.id} ${r.title}\n  ${hits.get(r.id)!.join("\n  ")}`);
    console.log(`todo: ${hits.size} of ${rows.length} open items have commits touching their files since found`);
  } else if (cmd === "decisions") {
    for (const r of listDecisions(db)) console.log(`${r.id} [${r.decision.kind}] ${r.decision.question}\n${r.decision.options.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}`);
  } else if (cmd === "decide" && rest[0] && rest[1]) {
    console.log(`todo: ${decide(db, rest[0], rest[1])}`);
  } else if (cmd === "claim" && rest[0]) {
    // A session working an item marks it so the nightly autopilot skips it; autopilot drops claims older than 3 days.
    const ok = db.query(`UPDATE todos SET run_id = ? WHERE id = ? AND status = 'open'`).run(`session:${new Date().toISOString().slice(0, 10)}`, rest[0]).changes > 0;
    console.log(ok ? `todo: claimed ${rest[0]}` : `todo: ${rest[0]} not open`);
  } else if (cmd === "reopen" && rest[0]) {
    console.log(reopenTodo(db, rest[0]) ? `todo: reopened ${rest[0]}` : `todo: ${rest[0]} already open or unknown`);
  } else {
    console.error("usage: todo.ts add --title <t> [--why] [--evidence] [--repo] [--project] [--session] | list [--project] [--all] [--json] | close <id> [--by] | dismiss <id> | claim <id> | reopen <id> | check | decisions | decide <id> <n|dismiss>");
    process.exit(1);
  }
  } catch (e) {
    console.error(`todo: ledger unavailable (${String(e).slice(0, 120)}); retry in a minute`);
    process.exit(1);
  }
}
