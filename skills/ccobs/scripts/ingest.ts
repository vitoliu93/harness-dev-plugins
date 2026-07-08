#!/usr/bin/env bun
// ccobs ingest — incremental, idempotent sweep of ~/.claude/projects JSONL into obs.db.
// Facts + pointers only; message bodies never enter the DB.
// Safe to re-run any time; safe to delete the DB and rebuild.
//
// Usage:
//   bun ingest.ts                 # full incremental sweep
//   bun ingest.ts --project X     # only project dirs whose name contains X
//   bun ingest.ts --queue         # only sessions listed in queue.jsonl (Stop-hook feed)

import { Database } from "bun:sqlite";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";

const ROOT = process.env.CCOBS_ROOT ?? join(homedir(), ".claude", "projects");
const OBS_DIR = process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability");
const DB_PATH = join(OBS_DIR, "obs.db");
const QUEUE = join(OBS_DIR, "queue.jsonl");
const CMD_RE = /<command-name>\/?([\w:/-]+)<\/command-name>/g;
// <synthetic> is CC's own compaction-summary marker, not a third-party model — keep it.
const isClaudeModel = (model: string | null) => model == null || model.startsWith("claude-") || model === "<synthetic>";

type Meta = {
  started_at: string | null;
  ended_at: string | null;
  cwd: string | null;
  git_branch: string | null;
  cc_version: string | null;
  subagent_type: string | null;
};

function connect(): Database {
  mkdirSync(OBS_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(readFileSync(join(import.meta.dir, "schema.sql"), "utf8"));
  // migrations for pre-existing DBs; no-op (caught) when the column already exists
  for (const ddl of [
    "ALTER TABLE sessions ADD COLUMN subagent_type TEXT",
    "ALTER TABLE tool_calls ADD COLUMN error_snippet TEXT",
  ]) {
    try { db.exec(ddl); } catch {}
  }
  return db;
}

function sessionMeta(path: string): [string, string, string | null] {
  const parts = path.split(sep);
  const stem = basename(path, ".jsonl");
  if (parts.length >= 3 && parts[parts.length - 2] === "subagents") {
    return [stem, "subagent", parts[parts.length - 3]];
  }
  return [stem, "main", null];
}

const db = connect();
const stmts = {
  getState: db.prepare("SELECT offset FROM ingest_state WHERE path = ?"),
  getSession: db.prepare("SELECT session_id FROM sessions WHERE session_id = ?"),
  putState: db.prepare("INSERT OR REPLACE INTO ingest_state VALUES (?,?)"),
  turn: db.prepare(
    "INSERT OR IGNORE INTO turns(message_id, session_id, ts, model, input_tokens, output_tokens, cache_read, cache_create, stop_reason) VALUES (?,?,?,?,?,?,?,?,?)",
  ),
  tool: db.prepare(
    "INSERT OR IGNORE INTO tool_calls(id, session_id, ts, tool, skill, subagent_type, model_param, background) VALUES (?,?,?,?,?,?,?,?)",
  ),
  toolErr: db.prepare("UPDATE tool_calls SET is_error = 1, error_snippet = COALESCE(?, error_snippet) WHERE id = ?"),
  slash: db.prepare(
    "INSERT OR IGNORE INTO tool_calls(id, session_id, ts, tool, skill) VALUES (?,?,?,'SlashCommand',?)",
  ),
  hook: db.prepare("INSERT INTO hook_runs(session_id, ts, command, duration_ms) VALUES (?,?,?,?)"),
  hookErr: db.prepare("INSERT INTO hook_runs(session_id, ts, command, error) VALUES (?,?,?,?)"),
  session: db.prepare(
    `INSERT INTO sessions(session_id, kind, parent_id, subagent_type, project, cwd, git_branch, cc_version, started_at, ended_at, file_path)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id) DO UPDATE SET
       ended_at      = MAX(COALESCE(sessions.ended_at,''), COALESCE(excluded.ended_at,'')),
       started_at    = COALESCE(sessions.started_at, excluded.started_at),
       subagent_type = COALESCE(sessions.subagent_type, excluded.subagent_type),
       cwd           = COALESCE(sessions.cwd, excluded.cwd),
       git_branch    = COALESCE(sessions.git_branch, excluded.git_branch),
       cc_version    = COALESCE(sessions.cc_version, excluded.cc_version)`,
  ),
};

type Buf = {
  turns: any[][];
  tools: any[][];
  toolErrs: any[][];
  slashes: any[][];
  hooks: any[][];
  hookErrs: any[][];
};

function handleEvent(o: any, sid: string, meta: Meta, buf: Buf) {
  const ts: string | null = o.timestamp ?? null;
  if (ts) {
    meta.started_at = meta.started_at && meta.started_at < ts ? meta.started_at : ts;
    meta.ended_at = meta.ended_at && meta.ended_at > ts ? meta.ended_at : ts;
  }
  meta.cwd ??= o.cwd ?? null;
  meta.git_branch ??= o.gitBranch ?? null;
  meta.cc_version ??= o.version ?? null;
  meta.subagent_type ??= o.agentType ?? null; // present in newer CC subagent JSONL; older files get backfilled post-ingest

  for (const h of o.hookInfos ?? []) {
    buf.hooks.push([sid, ts, h.command ?? null, h.durationMs ?? null]);
  }
  for (const e of o.hookErrors ?? []) {
    const cmd = typeof e === "object" && e !== null ? (e.command ?? null) : null;
    buf.hookErrs.push([sid, ts, cmd && String(cmd).slice(0, 200), String(JSON.stringify(e)).slice(0, 500)]);
  }

  const m = o.message ?? {};
  if (o.type === "assistant") {
    const u = m.usage;
    const mid = m.id ?? o.messageId;
    if (mid && u) {
      buf.turns.push([
        mid, sid, ts, m.model ?? null,
        u.input_tokens ?? null, u.output_tokens ?? null,
        u.cache_read_input_tokens ?? null, u.cache_creation_input_tokens ?? null,
        o.stopReason ?? null,
      ]);
    }
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (c?.type !== "tool_use") continue;
      const inp = c.input ?? {};
      const isAgent = c.name === "Agent" || c.name === "Task"; // two historical names, one tool — normalize here so views stay plain equality
      buf.tools.push([
        c.id ?? null, sid, ts, isAgent ? "Agent" : (c.name ?? null),
        c.name === "Skill" ? (inp.skill ?? null) : c.name === "SlashCommand" ? (inp.command ?? null) : null,
        isAgent ? (inp.subagent_type ?? null) : null,
        isAgent ? (inp.model ?? null) : null,
        inp.run_in_background ? 1 : 0,
      ]);
    }
  } else if (o.type === "user") {
    const content = m.content;
    const texts: string[] = [];
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "tool_result" && c.is_error) {
          const raw = typeof c.content === "string"
            ? c.content
            : (Array.isArray(c.content) ? c.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join(" ") : "");
          buf.toolErrs.push([raw ? raw.slice(0, 300) : null, c.tool_use_id]);
        } else if (c?.type === "text" && c.text) texts.push(c.text);
      }
    }
    for (const text of texts) {
      for (const match of text.matchAll(CMD_RE)) {
        buf.slashes.push([`cmd-${sid}-${o.uuid}-${match[1]}`, sid, ts, match[1]]);
      }
    }
  }
}

function ingestFile(path: string): number {
  const [sid, kind, parent] = sessionMeta(path);
  const project = relative(ROOT, path).split(sep)[0];
  const row = stmts.getState.get(path) as { offset: number } | null;
  let offset = row?.offset ?? 0;
  const { size } = statSync(path);
  if (size < offset) offset = 0; // file was rewritten; idempotent inserts absorb dups
  if (size === offset) return 0;

  const meta: Meta = { started_at: null, ended_at: null, cwd: null, git_branch: null, cc_version: null, subagent_type: null };
  const buf: Buf = { turns: [], tools: [], toolErrs: [], slashes: [], hooks: [], hookErrs: [] };
  // read only the unseen tail — a long-lived session's file otherwise gets fully re-read on every Stop
  const fd = openSync(path, "r");
  const chunk = Buffer.allocUnsafe(size - offset);
  const bytesRead = readSync(fd, chunk, 0, size - offset, offset);
  closeSync(fd);
  const data = chunk.subarray(0, bytesRead);
  let pos = 0;
  let n = 0;
  while (pos < data.length) {
    const nl = data.indexOf(10, pos);
    if (nl === -1) break; // incomplete tail of a live file; picked up next run
    const line = data.toString("utf8", pos, nl);
    pos = nl + 1;
    try {
      handleEvent(JSON.parse(line), sid, meta, buf);
      n++;
    } catch {}
  }

  // A session is non-Claude if neither this chunk nor a prior sweep ever saw a Claude
  // turn — skip persisting it entirely (turns/tools/hooks/session row), so third-party
  // models (deepseek, glm, doubao, ...) routed through the same JSONL format never
  // pollute the ledger. A session already on file (prior claude turn) keeps flowing;
  // only its non-claude turn rows get dropped below.
  const knownClaudeSession = !!stmts.getSession.get(sid);
  const hasClaudeTurn = buf.turns.some((t) => isClaudeModel(t[3]));
  if (!knownClaudeSession && !hasClaudeTurn) {
    stmts.putState.run(path, offset + pos);
    return 0;
  }

  for (const t of buf.turns) if (isClaudeModel(t[3])) stmts.turn.run(...t);
  for (const t of buf.tools) stmts.tool.run(...t);
  for (const t of buf.toolErrs) stmts.toolErr.run(...t);
  for (const t of buf.slashes) stmts.slash.run(...t);
  for (const t of buf.hooks) stmts.hook.run(...t);
  for (const t of buf.hookErrs) stmts.hookErr.run(...t);

  stmts.session.run(sid, kind, parent, meta.subagent_type, project, meta.cwd, meta.git_branch, meta.cc_version,
    meta.started_at, meta.ended_at, path);
  stmts.putState.run(path, offset + pos);
  return n;
}

function targetFiles(args: string[]): string[] {
  if (args.includes("--queue")) {
    if (!existsSync(QUEUE)) return [];
    const paths = new Set<string>();
    for (const line of readFileSync(QUEUE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const p = JSON.parse(line).transcript_path;
        if (p && existsSync(p)) {
          paths.add(p);
          const sub = join(dirname(p), basename(p, ".jsonl"), "subagents");
          if (existsSync(sub)) {
            for (const f of new Bun.Glob("*.jsonl").scanSync({ cwd: sub, absolute: true })) paths.add(f);
          }
        }
      } catch {}
    }
    renameSync(QUEUE, QUEUE + ".done"); // consume the queue
    return [...paths].sort();
  }
  const idx = args.indexOf("--project");
  const filter = idx !== -1 ? args[idx + 1] : null;
  const paths = [...new Bun.Glob("**/*.jsonl").scanSync({ cwd: ROOT, absolute: true })];
  return (filter ? paths.filter((p) => relative(ROOT, p).split(sep)[0].includes(filter)) : paths).sort();
}

const files = targetFiles(process.argv.slice(2));
let total = 0;
let touched = 0;
db.exec("BEGIN");
for (const p of files) {
  const n = ingestFile(p);
  if (n > 0) {
    touched++;
    total += n;
  }
}
db.exec("COMMIT");
// Backfill subagent_type for sessions whose JSONL predates the agentType field:
// nearest preceding Agent spawn in the parent session. Idempotent; NULL stays
// NULL until the parent's tool_calls arrive on a later sweep.
db.exec(`
  UPDATE sessions SET subagent_type = (
    SELECT tc.subagent_type FROM tool_calls tc
    WHERE tc.session_id = sessions.parent_id AND tc.tool = 'Agent' AND tc.ts <= sessions.started_at
    ORDER BY tc.ts DESC LIMIT 1
  ) WHERE kind = 'subagent' AND subagent_type IS NULL AND parent_id IS NOT NULL`);
db.close();
console.log(`ccobs: ${touched}/${files.length} files had new data, ${total} events ingested → ${DB_PATH}`);
