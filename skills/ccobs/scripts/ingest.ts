#!/usr/bin/env bun
// ccobs ingest — incremental, idempotent sweep of agent observability data into obs.db.
// Seven adapters: claude-code, codex, droid, grok, opencode, cursor-ide, cursor-agent.
// Facts + pointers for every source; locally available Cursor transcript parts are retained.
// Safe to re-run any time; safe to delete the DB and rebuild.
//
// Usage:
//   bun ingest.ts                           # full incremental sweep
//   bun ingest.ts --project X               # only project dirs whose name contains X
//   bun ingest.ts --queue                   # only sessions listed in queue.jsonl (Stop-hook feed, claude-code only)
//   bun ingest.ts --source codex            # single-source debug
//   bun ingest.ts --source cursor-ide       # single-source debug

import { Database } from "bun:sqlite"
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, relative, sep } from "node:path"

const ROOT = process.env.CCOBS_ROOT ?? join(homedir(), ".claude", "projects")
const OBS_DIR = process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability")
const DB_PATH = join(OBS_DIR, "obs.db")
const QUEUE = join(OBS_DIR, "queue.jsonl")
const CMD_RE = /<command-name>\/?([\w:/-]+)<\/command-name>/g

type Meta = {
  started_at: string | null
  ended_at: string | null
  cwd: string | null
  git_branch: string | null
  cc_version: string | null
  subagent_type: string | null
}

type Buf = {
  turns: any[][]
  tools: any[][]
  toolErrs: any[][]
  slashes: any[][]
  hooks: any[][]
  hookErrs: any[][]
}

function connect(): Database {
  mkdirSync(OBS_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.exec(readFileSync(join(import.meta.dir, "schema.sql"), "utf8"))
  for (const ddl of [
    "ALTER TABLE sessions ADD COLUMN subagent_type TEXT",
    "ALTER TABLE tool_calls ADD COLUMN error_snippet TEXT",
    "ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'claude-code'",
  ]) {
    try { db.exec(ddl) } catch {}
  }
  return db
}

function encodeProject(cwd: string | null | undefined): string {
  if (cwd == null) return "unknown"
  if (cwd === "") return ""
  return cwd.replaceAll("/", "-")
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function jsonValue(value: unknown): string | null {
  if (value == null) return null
  try { return JSON.stringify(value) } catch { return null }
}

// ===================== shared prepared statements =====================

function prepStmts(db: Database) {
  return {
    getState: db.prepare("SELECT offset FROM ingest_state WHERE path = ?"),
    getSession: db.prepare("SELECT session_id FROM sessions WHERE session_id = ?"),
    putState: db.prepare("INSERT OR REPLACE INTO ingest_state VALUES (?,?)"),
    turn: db.prepare(
      `INSERT INTO turns(message_id, session_id, ts, model, input_tokens, output_tokens, cache_read, cache_create, stop_reason)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(message_id) DO UPDATE SET
         ts            = COALESCE(excluded.ts, turns.ts),
         model         = COALESCE(excluded.model, turns.model),
         input_tokens  = COALESCE(excluded.input_tokens, turns.input_tokens),
         output_tokens = COALESCE(excluded.output_tokens, turns.output_tokens),
         cache_read    = COALESCE(excluded.cache_read, turns.cache_read),
         cache_create  = COALESCE(excluded.cache_create, turns.cache_create),
         stop_reason   = COALESCE(excluded.stop_reason, turns.stop_reason)`,
    ),
    tool: db.prepare(
      `INSERT INTO tool_calls(id, session_id, ts, tool, skill, subagent_type, model_param, background)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         ts            = COALESCE(excluded.ts, tool_calls.ts),
         tool          = COALESCE(excluded.tool, tool_calls.tool),
         skill         = COALESCE(excluded.skill, tool_calls.skill),
         subagent_type = COALESCE(excluded.subagent_type, tool_calls.subagent_type),
         model_param   = COALESCE(excluded.model_param, tool_calls.model_param),
         background    = COALESCE(excluded.background, tool_calls.background)`,
    ),
    toolErr: db.prepare("UPDATE tool_calls SET is_error = 1, error_snippet = COALESCE(?, error_snippet) WHERE id = ?"),
    part: db.prepare(
      `INSERT INTO message_parts(
         part_id, session_id, message_id, seq, part_index, ts, role, part_type, model,
         tool_call_id, tool_name, content, data_json, is_error
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(part_id) DO UPDATE SET
         seq          = COALESCE(excluded.seq, message_parts.seq),
         ts           = COALESCE(excluded.ts, message_parts.ts),
         model        = COALESCE(excluded.model, message_parts.model),
         tool_call_id = COALESCE(excluded.tool_call_id, message_parts.tool_call_id),
         tool_name    = COALESCE(excluded.tool_name, message_parts.tool_name),
         content      = COALESCE(excluded.content, message_parts.content),
         data_json    = COALESCE(excluded.data_json, message_parts.data_json),
         is_error     = MAX(excluded.is_error, message_parts.is_error)`,
    ),
    slash: db.prepare(
      "INSERT OR IGNORE INTO tool_calls(id, session_id, ts, tool, skill) VALUES (?,?,?,'SlashCommand',?)",
    ),
    hook: db.prepare("INSERT INTO hook_runs(session_id, ts, command, duration_ms) VALUES (?,?,?,?)"),
    hookErr: db.prepare("INSERT INTO hook_runs(session_id, ts, command, error) VALUES (?,?,?,?)"),
    session: db.prepare(
      `INSERT INTO sessions(session_id, kind, parent_id, subagent_type, project, cwd, git_branch, cc_version, started_at, ended_at, file_path, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         ended_at      = MAX(COALESCE(sessions.ended_at,''), COALESCE(excluded.ended_at,'')),
         started_at    = COALESCE(sessions.started_at, excluded.started_at),
         subagent_type = COALESCE(sessions.subagent_type, excluded.subagent_type),
         cwd           = COALESCE(sessions.cwd, excluded.cwd),
         git_branch    = COALESCE(sessions.git_branch, excluded.git_branch),
         cc_version    = COALESCE(sessions.cc_version, excluded.cc_version),
         source        = COALESCE(sessions.source, excluded.source)`,
    ),
  }
}
type Stmts = ReturnType<typeof prepStmts>

// ===================== source-specific file-path utils =====================

function scanGlob(cwd: string, pattern: string): string[] {
  if (!existsSync(cwd)) return []
  return [...new Bun.Glob(pattern).scanSync({ cwd, absolute: true })].sort()
}

// ===================== adapter: claude-code =====================

function sessionMeta(path: string): [string, string, string | null] {
  const parts = path.split(sep)
  const stem = basename(path, ".jsonl")
  // Walk backwards to find "subagents" directory — depth varies with workflow nesting
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] === "subagents") {
      const parent = parts[i - 1]
      return [stem, "subagent", parent]
    }
  }
  return [stem, "main", null]
}

function handleCcEvent(o: any, sid: string, meta: Meta, buf: Buf) {
  const ts: string | null = o.timestamp ?? null
  if (ts) {
    meta.started_at = meta.started_at && meta.started_at < ts ? meta.started_at : ts
    meta.ended_at = meta.ended_at && meta.ended_at > ts ? meta.ended_at : ts
  }
  meta.cwd ??= o.cwd ?? null
  meta.git_branch ??= o.gitBranch ?? null
  meta.cc_version ??= o.version ?? null
  meta.subagent_type ??= o.agentType ?? null

  for (const h of o.hookInfos ?? []) {
    buf.hooks.push([sid, ts, h.command ?? null, h.durationMs ?? null])
  }
  for (const e of o.hookErrors ?? []) {
    const cmd = typeof e === "object" && e !== null ? (e.command ?? null) : null
    buf.hookErrs.push([sid, ts, cmd && String(cmd).slice(0, 200), String(JSON.stringify(e)).slice(0, 500)])
  }

  const m = o.message ?? {}
  if (o.type === "assistant") {
    const u = m.usage
    const mid = m.id ?? o.messageId
    if (mid && u) {
      buf.turns.push([
        mid, sid, ts, m.model ?? null,
        u.input_tokens ?? null, u.output_tokens ?? null,
        u.cache_read_input_tokens ?? null, u.cache_creation_input_tokens ?? null,
        m.stop_reason ?? o.stopReason ?? null,
      ])
    }
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (c?.type !== "tool_use") continue
      const inp = c.input ?? {}
      const isAgent = c.name === "Agent" || c.name === "Task"
      buf.tools.push([
        c.id ?? null, sid, ts, isAgent ? "Agent" : (c.name ?? null),
        c.name === "Skill" ? (inp.skill ?? null) : c.name === "SlashCommand" ? (inp.command ?? null) : null,
        isAgent ? (inp.subagent_type ?? null) : null,
        isAgent ? (inp.model ?? null) : null,
        inp.run_in_background ? 1 : 0,
      ])
    }
  } else if (o.type === "user") {
    const content = m.content
    const texts: string[] = []
    if (typeof content === "string") texts.push(content)
    else if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "tool_result" && c.is_error) {
          const raw = typeof c.content === "string"
            ? c.content
            : (Array.isArray(c.content) ? c.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join(" ") : "")
          buf.toolErrs.push([raw ? raw.slice(0, 300) : null, c.tool_use_id])
        } else if (c?.type === "text" && c.text) texts.push(c.text)
      }
    }
    for (const text of texts) {
      for (const match of text.matchAll(CMD_RE)) {
        buf.slashes.push([`cmd-${sid}-${o.uuid}-${match[1]}`, sid, ts, match[1]])
      }
    }
  }
}

const claudeCode: Adapter = {
  name: "claude-code",
  discover(args: string[]) {
    if (args.includes("--queue")) {
      if (!existsSync(QUEUE)) return []
      const paths = new Set<string>()
      for (const line of readFileSync(QUEUE, "utf8").split("\n")) {
        if (!line.trim()) continue
        try {
          const p = JSON.parse(line).transcript_path
          if (p && existsSync(p)) {
            paths.add(p)
            const sub = join(dirname(p), basename(p, ".jsonl"), "subagents")
            if (existsSync(sub)) {
              for (const f of new Bun.Glob("*.jsonl").scanSync({ cwd: sub, absolute: true })) paths.add(f)
            }
          }
        } catch {}
      }
      renameSync(QUEUE, QUEUE + ".done")
      return [...paths].sort()
    }
    const idx = args.indexOf("--project")
    const filter = idx !== -1 ? args[idx + 1] : null
    const candidates = scanGlob(ROOT, "**/*.jsonl")
    return filter ? candidates.filter(p => relative(ROOT, p).split(sep)[0].includes(filter)) : candidates
  },
  ingest(stmts: Stmts) {
    let total = 0
    for (const path of this._files) {
      total += ingestCcFile(path, stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestCcFile(path: string, stmts: Stmts): number {
  const [sid, kind, parent] = sessionMeta(path)
  const project = relative(ROOT, path).split(sep)[0]
  const row = stmts.getState.get(path) as { offset: number } | null
  let offset = row?.offset ?? 0
  const { size } = statSync(path)
  if (size < offset) offset = 0
  if (size === offset) return 0

  const meta: Meta = { started_at: null, ended_at: null, cwd: null, git_branch: null, cc_version: null, subagent_type: null }
  const buf: Buf = { turns: [], tools: [], toolErrs: [], slashes: [], hooks: [], hookErrs: [] }

  const fd = openSync(path, "r")
  const chunk = Buffer.allocUnsafe(size - offset)
  const bytesRead = readSync(fd, chunk, 0, size - offset, offset)
  closeSync(fd)
  const data = chunk.subarray(0, bytesRead)
  let pos = 0
  let n = 0
  while (pos < data.length) {
    const nl = data.indexOf(10, pos)
    if (nl === -1) break
    const line = data.toString("utf8", pos, nl)
    pos = nl + 1
    try { handleCcEvent(JSON.parse(line), sid, meta, buf); n++ } catch {}
  }

  for (const t of buf.turns) stmts.turn.run(...t)
  for (const t of buf.tools) stmts.tool.run(...t)
  for (const t of buf.toolErrs) stmts.toolErr.run(...t)
  for (const t of buf.slashes) stmts.slash.run(...t)
  for (const t of buf.hooks) stmts.hook.run(...t)
  for (const t of buf.hookErrs) stmts.hookErr.run(...t)

  stmts.session.run(sid, kind, parent, meta.subagent_type, project, meta.cwd, meta.git_branch, meta.cc_version,
    meta.started_at, meta.ended_at, path, "claude-code")
  stmts.putState.run(path, offset + pos)
  return n
}

// ===================== adapter: codex =====================

const CODEX_ROOT = join(homedir(), ".codex", "sessions")

const codex: Adapter = {
  name: "codex",
  discover() { return scanGlob(CODEX_ROOT, "**/*.jsonl") },
  ingest(stmts: Stmts) {
    let total = 0
    for (const path of this._files) {
      total += ingestCodexFile(path, stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestCodexFile(path: string, stmts: Stmts): number {
  // session_id from filename uuid (last 36 chars of stem)
  const stem = basename(path, ".jsonl")
  let sid = stem.length >= 36 ? stem.slice(-36) : stem
  const row = stmts.getState.get(path) as { offset: number } | null
  let offset = row?.offset ?? 0
  const { size } = statSync(path)
  if (size < offset) offset = 0
  if (size === offset) return 0

  const meta: Meta = { started_at: null, ended_at: null, cwd: null, git_branch: null, cc_version: null, subagent_type: null }
  const buf: Buf = { turns: [], tools: [], toolErrs: [], slashes: [], hooks: [], hookErrs: [] }

  const fd = openSync(path, "r")
  const chunk = Buffer.allocUnsafe(size - offset)
  const bytesRead = readSync(fd, chunk, 0, size - offset, offset)
  closeSync(fd)
  const data = chunk.subarray(0, bytesRead)

  let currentModel: string | null = null
  let pos = 0
  let n = 0
  while (pos < data.length) {
    const nl = data.indexOf(10, pos)
    if (nl === -1) break
    const line = data.toString("utf8", pos, nl)
    pos = nl + 1
    let o: any
    try { o = JSON.parse(line) } catch { continue }
    n++

    const ts: string | null = o.timestamp ?? null
    if (ts) {
      meta.started_at = meta.started_at && meta.started_at < ts ? meta.started_at : ts
      meta.ended_at = meta.ended_at && meta.ended_at > ts ? meta.ended_at : ts
    }

    if (o.type === "session_meta") {
      const p = o.payload ?? {}
      meta.cwd ??= p.cwd ?? null
      meta.cc_version ??= p.cli_version ?? null
      // session_id from payload.id (preferred) — overrides filename-derived sid
      if (p.id) sid = p.id
    } else if (o.type === "turn_context") {
      const p = o.payload ?? {}
      currentModel = p.model ?? null
    } else if (o.type === "event_msg") {
      const p = o.payload ?? {}
      if (p.type === "token_count") {
        const last = p.info?.last_token_usage ?? {}
        const mid = `cx-${sid}-${offset + pos}` // absolute byte position — chunk-relative pos collides across incremental sweeps
        buf.turns.push([
          mid, sid, ts, currentModel,
          last.input_tokens ?? null, last.output_tokens ?? null,
          last.cached_input_tokens ?? null, null, null,
        ])
      }
    } else if (o.type === "response_item") {
      const p = o.payload ?? {}
      if (p.type === "function_call") {
        const callId = p.call_id ?? `cx-${sid}-${offset + pos}`
        const toolName = p.name ?? null
        const isAgent = toolName === "spawn_agent"
        let spawnArgs: any = {}
        if (isAgent) {
          try { spawnArgs = typeof p.arguments === "string" ? JSON.parse(p.arguments) : (p.arguments ?? {}) } catch {}
        }
        buf.tools.push([
          callId, sid, ts, isAgent ? "Agent" : (toolName ?? null),
          null, // skill always NULL for codex
          isAgent ? (spawnArgs.subagent_type ?? spawnArgs.agent_type ?? null) : null,
          isAgent ? (spawnArgs.model ?? null) : null,
          spawnArgs.run_in_background ? 1 : 0,
        ])
      }
    }
  }

  for (const t of buf.turns) stmts.turn.run(...t)
  for (const t of buf.tools) stmts.tool.run(...t)
  for (const t of buf.toolErrs) stmts.toolErr.run(...t)

  const project = encodeProject(meta.cwd)
  stmts.session.run(sid, "main", null, meta.subagent_type, project, meta.cwd, meta.git_branch, meta.cc_version,
    meta.started_at, meta.ended_at, path, "codex")
  stmts.putState.run(path, offset + pos)
  return n
}

// ===================== adapter: droid =====================

const DROID_ROOT = join(homedir(), ".factory", "sessions")

const droid: Adapter = {
  name: "droid",
  discover() { return scanGlob(DROID_ROOT, "*/*.jsonl") },
  ingest(stmts: Stmts) {
    let total = 0
    for (const path of this._files) {
      total += ingestDroidFile(path, stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestDroidFile(path: string, stmts: Stmts): number {
  // session_id from filename stem (uuid) — NOT from session_start.id
  const sid = basename(path, ".jsonl")
  const row = stmts.getState.get(path) as { offset: number } | null
  let offset = row?.offset ?? 0
  const { size } = statSync(path)
  if (size < offset) offset = 0
  if (size === offset) return 0

  // Read settings.json sidecar for model
  const settingsPath = path + ".settings.json"
  let sessionModel: string | null = null
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"))
      sessionModel = settings.model ?? null
    } catch {}
  }

  const meta: Meta = { started_at: null, ended_at: null, cwd: null, git_branch: null, cc_version: null, subagent_type: null }
  const buf: Buf = { turns: [], tools: [], toolErrs: [], slashes: [], hooks: [], hookErrs: [] }

  const fd = openSync(path, "r")
  const chunk = Buffer.allocUnsafe(size - offset)
  const bytesRead = readSync(fd, chunk, 0, size - offset, offset)
  closeSync(fd)
  const data = chunk.subarray(0, bytesRead)

  let pos = 0
  let n = 0
  while (pos < data.length) {
    const nl = data.indexOf(10, pos)
    if (nl === -1) break
    const line = data.toString("utf8", pos, nl)
    pos = nl + 1
    let o: any
    try { o = JSON.parse(line) } catch { continue }
    n++

    if (o.type === "session_start") {
      meta.cwd ??= o.cwd ?? null
      // No timestamp on session_start; rely on message events for time bounds
    } else if (o.type === "message") {
      const ts: string | null = o.timestamp ?? null
      if (ts) {
        meta.started_at = meta.started_at && meta.started_at < ts ? meta.started_at : ts
        meta.ended_at = meta.ended_at && meta.ended_at > ts ? meta.ended_at : ts
      }
      const msg = o.message ?? {}
      if (msg.role === "assistant") {
        const mid = o.id ?? `dr-${sid}-${offset + pos}`
        buf.turns.push([mid, sid, ts, sessionModel, null, null, null, null, null])
        for (const c of Array.isArray(msg.content) ? msg.content : []) {
          if (c?.type !== "tool_use") continue
          const inp = c.input ?? {}
          // Prefix id with sid to avoid collision across sessions (ids like "Execute_0")
          const tcId = `${sid}-${c.id ?? `dr-${offset + pos}`}`
          const name = c.name ?? null
          const isAgent = name === "Agent" || name === "Task"
          buf.tools.push([
            tcId, sid, ts, isAgent ? "Agent" : name,
            name === "Skill" ? (inp.skill ?? null) : null,
            isAgent ? (inp.subagent_type ?? null) : null,
            null, null,
          ])
        }
      }
    }
  }

  for (const t of buf.turns) stmts.turn.run(...t)
  for (const t of buf.tools) stmts.tool.run(...t)

  const project = basename(dirname(path))
  stmts.session.run(sid, "main", null, meta.subagent_type, project, meta.cwd, meta.git_branch, meta.cc_version,
    meta.started_at, meta.ended_at, path, "droid")
  stmts.putState.run(path, offset + pos)
  return n
}

// ===================== adapter: grok =====================

const GROK_ROOT = join(homedir(), ".grok", "sessions")

const grok: Adapter = {
  name: "grok",
  discover() {
    const summaries = scanGlob(GROK_ROOT, "*/*/summary.json")
    // Return session directory paths (parent of summary.json)
    return summaries.map(p => dirname(p))
  },
  ingest(stmts: Stmts) {
    let total = 0
    for (const dir of this._files) {
      total += ingestGrokSession(dir, stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestGrokSession(sessionDir: string, stmts: Stmts): number {
  // Read summary.json (rewritten every round — unconditional upsert)
  const summaryPath = join(sessionDir, "summary.json")
  if (!existsSync(summaryPath)) return 0
  let summary: any
  try { summary = JSON.parse(readFileSync(summaryPath, "utf8")) } catch { return 0 }

  const info = summary.info ?? {}
  const sid = info.id ?? basename(sessionDir)

  // project: decodeURIComponent on the project-level dir name, then encode
  const projectDir = basename(dirname(sessionDir)) // e.g. %2FUsers%2F...
  let projectCwd: string
  try { projectCwd = decodeURIComponent(projectDir) } catch { projectCwd = projectDir }
  const project = encodeProject(projectCwd)

  const startedAt = summary.created_at ?? null
  const endedAt = summary.updated_at ?? null
  const model = summary.current_model_id ?? null
  const ccVersion = null
  const agentName = summary.agent_name ?? null
  const subagentType = agentName && agentName !== "grok" ? agentName : null

  // events.jsonl: byte-offset incremental read
  const eventsPath = join(sessionDir, "events.jsonl")
  if (!existsSync(eventsPath)) {
    // Still upsert the session row from summary even without events
    stmts.session.run(sid, "main", null, subagentType, project, projectCwd, null, ccVersion,
      startedAt, endedAt, summaryPath, "grok")
    return 0
  }

  const row = stmts.getState.get(eventsPath) as { offset: number } | null
  let offset = row?.offset ?? 0
  const { size } = statSync(eventsPath)
  if (size < offset) offset = 0

  const meta: Meta = {
    started_at: startedAt, ended_at: endedAt,
    cwd: projectCwd, git_branch: null, cc_version: ccVersion, subagent_type: subagentType,
  }
  const buf: Buf = { turns: [], tools: [], toolErrs: [], slashes: [], hooks: [], hookErrs: [] }

  let eventsRead = 0
  let pos = 0
  if (size > offset) {
    const fd = openSync(eventsPath, "r")
    const chunk = Buffer.allocUnsafe(size - offset)
    const bytesRead = readSync(fd, chunk, 0, size - offset, offset)
    closeSync(fd)
    const data = chunk.subarray(0, bytesRead)

    while (pos < data.length) {
      const nl = data.indexOf(10, pos)
      if (nl === -1) break
      const line = data.toString("utf8", pos, nl)
      pos = nl + 1
      let o: any
      try { o = JSON.parse(line) } catch { continue }

      const ts: string | null = o.ts ?? null
      if (ts) {
        meta.started_at = meta.started_at && meta.started_at < ts ? meta.started_at : ts
        meta.ended_at = meta.ended_at && meta.ended_at > ts ? meta.ended_at : ts
      }

      if (o.type === "turn_started") {
        const mid = `gk-${sid}-${offset + pos}`
        buf.turns.push([mid, sid, ts, model, null, null, null, null, null])
        eventsRead++
      } else if (o.type === "tool_started") {
        const tcId = `gk-${sid}-${offset + pos}`
        const toolName = o.tool_name ?? null
        const isAgent = toolName === "spawn_subagent"
        buf.tools.push([
          tcId, sid, ts, isAgent ? "Agent" : toolName,
          null, // skill always NULL for grok
          null, null, null,
        ])
        eventsRead++
      }
      // Other event types (phase_changed, permission_*, etc.) are ignored
    }

    for (const t of buf.turns) stmts.turn.run(...t)
    for (const t of buf.tools) stmts.tool.run(...t)
  }

  stmts.session.run(sid, "main", null, meta.subagent_type, project, meta.cwd, meta.git_branch, meta.cc_version,
    meta.started_at, meta.ended_at, summaryPath, "grok")
  stmts.putState.run(eventsPath, offset + pos)
  return eventsRead
}

// ===================== adapter: opencode =====================

const OPENCODE_DB = join(homedir(), ".local", "share", "opencode", "opencode.db")

const opencode: Adapter = {
  name: "opencode",
  discover() {
    return existsSync(OPENCODE_DB) ? [OPENCODE_DB] : []
  },
  ingest(stmts: Stmts) {
    let total = 0
    for (const _db of this._files) {
      total += ingestOpencode(stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestOpencode(stmts: Stmts): number {
  const row = stmts.getState.get(OPENCODE_DB) as { offset: number } | null
  const watermark = row?.offset ?? 0 // epoch-ms watermark
  const readable = new Database(OPENCODE_DB, { readonly: true })

  try {
    let total = 0
    let maxWatermark = watermark

    // — sessions —
    const sessionRows = readable.prepare(
      "SELECT s.id, s.parent_id, s.directory, s.project_id, s.version, s.time_created, s.time_updated FROM session s WHERE s.time_updated > ?",
    ).all(watermark) as any[]

    for (const s of sessionRows) {
      const sid = s.id
      const kind = s.parent_id ? "subagent" : "main"
      const parent = s.parent_id ?? null
      let cwd: string | null = s.directory
      if (!cwd && s.project_id) {
        const proj = readable.prepare("SELECT worktree FROM project WHERE id = ?").get(s.project_id) as { worktree: string } | null
        cwd = proj?.worktree ?? null
      }
      const project = encodeProject(cwd)
      const ccVersion = s.version ?? null
      const startedAt = s.time_created ? new Date(s.time_created).toISOString() : null
      const endedAt = s.time_updated ? new Date(s.time_updated).toISOString() : null
      stmts.session.run(sid, kind, parent, null, project, cwd, null, ccVersion,
        startedAt, endedAt, OPENCODE_DB, "opencode")
      total++
      if (s.time_updated > maxWatermark) maxWatermark = s.time_updated
    }

    // — messages (assistant only) —
    const msgRows = readable.prepare(
      "SELECT id, session_id, time_created, time_updated, data FROM message WHERE time_updated > ?",
    ).all(watermark) as any[]

    for (const m of msgRows) {
      const data = JSON.parse(m.data)
      if (data.role !== "assistant") {
        if (m.time_updated > maxWatermark) maxWatermark = m.time_updated
        continue
      }
      const ts = data.time?.created ? new Date(data.time.created).toISOString() : null
      const model = data.modelID ?? null
      const tokens = data.tokens ?? {}
      const inputT = tokens.input ?? null
      const outputT = tokens.output ?? null
      const cacheR = tokens.cache?.read ?? null
      const cacheC = tokens.cache?.write ?? null
      const stopReason = data.finish ?? null
      stmts.turn.run(m.id, m.session_id, ts, model, inputT, outputT, cacheR, cacheC, stopReason)
      total++
      if (m.time_updated > maxWatermark) maxWatermark = m.time_updated
    }

    // — parts (tool calls) —
    const partRows = readable.prepare(
      "SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE time_updated > ?",
    ).all(watermark) as any[]

    for (const p of partRows) {
      const data = typeof p.data === "string" ? JSON.parse(p.data) : p.data
      if (data.type !== "tool") {
        if (p.time_updated > maxWatermark) maxWatermark = p.time_updated
        continue
      }
      const ts = p.time_created ? new Date(p.time_created).toISOString() : null
      const rawTool = data.tool ?? null
      let tool: string, skill: string | null, subagentType: string | null
      if (rawTool === "skill") {
        tool = "Skill"
        skill = data.state?.input?.name ?? data.input?.name ?? null
        subagentType = null
      } else if (rawTool === "task") {
        tool = "Agent"
        skill = null
        subagentType = data.state?.input?.subagent_type ?? data.input?.subagent_type ?? null
      } else {
        tool = rawTool
        skill = null
        subagentType = null
      }
      const isError = data.state?.status === "error" ? 1 : 0
      stmts.tool.run(p.id, p.session_id, ts, tool, skill, subagentType, null, null)
      if (isError) {
        stmts.toolErr.run(null, p.id)
      }
      total++
      if (p.time_updated > maxWatermark) maxWatermark = p.time_updated
    }

    // Advance watermark
    if (maxWatermark > watermark) {
      stmts.putState.run(OPENCODE_DB, maxWatermark)
    }

    return total
  } finally {
    readable.close()
  }
}

// ===================== adapter: cursor-ide =====================

const CURSOR_IDE_DB = join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb")
const CURSOR_CONTENT_STATE_VERSION = "message-parts-v1"

const cursorIde: Adapter = {
  name: "cursor-ide",
  discover() {
    return existsSync(CURSOR_IDE_DB) ? [CURSOR_IDE_DB] : []
  },
  ingest(stmts: Stmts) {
    let total = 0
    for (const _db of this._files) {
      total += ingestCursorIde(stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestCursorIde(stmts: Stmts): number {
  // Version the state key so upgrading an existing facts-only DB performs one full content backfill.
  const statePath = `${CURSOR_IDE_DB}#${CURSOR_CONTENT_STATE_VERSION}`
  const row = stmts.getState.get(statePath) as { offset: number } | null
  const watermark = row?.offset ?? 0 // epoch-ms watermark over composerData.lastUpdatedAt
  let ide: Database
  try { ide = new Database(CURSOR_IDE_DB, { readonly: true }) } catch { return 0 }

  try {
    let total = 0
    let maxWatermark = watermark

    // Key-range scans (not LIKE) so the cursorDiskKV PK index is used — the table is 2 GB+.
    const comps = ide.prepare(
      "SELECT key, value FROM cursorDiskKV WHERE key >= 'composerData:' AND key < 'composerData;' AND value IS NOT NULL",
    ).all() as any[]
    const bubbleQ = ide.prepare(
      "SELECT key, value FROM cursorDiskKV WHERE key >= 'bubbleId:' || ? || ':' AND key < 'bubbleId:' || ? || ';' AND value IS NOT NULL",
    )

    for (const r of comps) {
      let c: any
      try { c = JSON.parse(r.value) } catch { continue }
      const updated = c.lastUpdatedAt ?? 0
      if (updated <= watermark) continue
      const sid = c.composerId ?? r.key.slice("composerData:".length)
      const cwd = c.workspaceIdentifier?.uri?.path ?? null
      const seqByBubble = new Map<string, number>()
      for (const [seq, header] of (Array.isArray(c.fullConversationHeadersOnly) ? c.fullConversationHeadersOnly : []).entries()) {
        if (header?.bubbleId) seqByBubble.set(String(header.bubbleId), seq)
      }

      const bubbles: Array<{ b: any, bid: string, seq: number | null, ts: string | null }> = []
      for (const br of bubbleQ.all(sid, sid) as any[]) {
        let b: any
        try { b = JSON.parse(br.value) } catch { continue }
        const bid = br.key.split(":")[2] ?? br.key
        bubbles.push({
          b,
          bid,
          seq: seqByBubble.get(bid) ?? null,
          ts: isoTimestamp(b.createdAt),
        })
      }
      bubbles.sort((a, b) =>
        (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)
        || (a.ts ?? "").localeCompare(b.ts ?? "")
        || a.bid.localeCompare(b.bid),
      )

      let currentModel: string | null = null
      for (const bubble of bubbles) {
        const { b, bid, seq, ts } = bubble
        if (b.type !== 1 && b.type !== 2) continue
        const role = b.type === 1 ? "user" : "assistant"
        const ownModel = b.modelInfo?.modelName ?? null
        if (b.type === 1 && ownModel) currentModel = ownModel
        // Only inherit across bubbles that are in the authoritative conversation headers.
        // Unordered branch/orphan bubbles must not receive the composer's latest model by guesswork.
        const model = ownModel ?? (seq !== null ? currentModel : null)
        let partIndex = 0

        if (b.type === 2) {
          const thinkingText = typeof b.thinking === "string" ? b.thinking : b.thinking?.text
          if (textValue(thinkingText)) {
            stmts.part.run(
              `cursor-ide:${sid}:${bid}:reasoning`, sid, bid, seq, partIndex++, ts,
              role, "reasoning", model, null, null, thinkingText, jsonValue(b.thinking), 0,
            )
          }
        }

        const text = textValue(b.text) ?? textValue(b.richText)
        if (text) {
          stmts.part.run(
            `cursor-ide:${sid}:${bid}:text`, sid, bid, seq, partIndex++, ts,
            role, "text", model, null, null, text, null, 0,
          )
        }

        if (b.type !== 2) continue
        // tokenCount is present on every bubble but almost always all-zero — zero means "not recorded"
        const tin = b.tokenCount?.inputTokens ?? 0
        const tout = b.tokenCount?.outputTokens ?? 0
        const hasTok = tin + tout > 0
        stmts.turn.run(bid, sid, ts, model,
          hasTok ? tin : null, hasTok ? tout : null, null, null, null)
        total++
        const tf = b.toolFormerData
        if (tf?.name) {
          stmts.tool.run(bid, sid, ts, tf.name, null, null, null, null)
          const { result, error, status, ...callData } = tf
          stmts.part.run(
            `cursor-ide:${sid}:${bid}:tool-call`, sid, bid, seq, partIndex++, ts,
            "assistant", "tool_call", model, bid, tf.name, null, jsonValue(callData), 0,
          )
          const hasResult = Object.hasOwn(tf, "result") || Object.hasOwn(tf, "error") || status === "error"
          if (hasResult) {
            const resultValue = error ?? result
            const isError = status === "error" || error != null
            stmts.part.run(
              `cursor-ide:${sid}:${bid}:tool-result`, sid, bid, seq, partIndex++, ts,
              "tool", "tool_result", model, bid, tf.name,
              typeof resultValue === "string" ? resultValue : null,
              jsonValue({ status, result: typeof resultValue === "string" ? undefined : resultValue }),
              isError ? 1 : 0,
            )
            if (isError) stmts.toolErr.run(textValue(error)?.slice(0, 300) ?? null, bid)
          }
          total++
        }
      }

      const startedAt = isoTimestamp(c.createdAt)
      const endedAt = isoTimestamp(updated)
      stmts.session.run(sid, "main", null, null, encodeProject(cwd), cwd, null, null,
        startedAt, endedAt, CURSOR_IDE_DB, "cursor-ide")
      if (updated > maxWatermark) maxWatermark = updated
    }

    if (maxWatermark > watermark) {
      stmts.putState.run(statePath, maxWatermark)
    }
    return total
  } finally {
    ide.close()
  }
}

// ===================== adapter: cursor-agent =====================

const CURSOR_CHATS = join(homedir(), ".cursor", "chats")

const cursorAgent: Adapter = {
  name: "cursor-agent",
  discover() { return scanGlob(CURSOR_CHATS, "*/*/store.db") },
  ingest(stmts: Stmts) {
    let total = 0
    for (const path of this._files) {
      total += ingestCursorAgentSession(path, stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestCursorAgentSession(path: string, stmts: Stmts): number {
  const dir = dirname(path)
  const sid = basename(dir) // session uuid = directory name
  let metaJson: any = {}
  try { metaJson = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) } catch {}
  const updated = metaJson.updatedAtMs ?? 0
  // Version the state key so upgrading an existing facts-only DB performs one full content backfill.
  const statePath = `${path}#${CURSOR_CONTENT_STATE_VERSION}`
  const row = stmts.getState.get(statePath) as { offset: number } | null
  if (updated && updated <= (row?.offset ?? 0)) return 0

  let db: Database
  // a fraction of store.dbs are unopenable (SQLITE_CANTOPEN) — skip, retry next sweep
  try {
    db = new Database(path, { readonly: true })
  } catch { return 0 }

  let n = 0
  let model: string | null = null
  let cwd: string | null = null
  try {
    // meta table: single row, value is (hex-encoded) JSON with lastUsedModel
    try {
      const m = db.prepare("SELECT value FROM meta LIMIT 1").get() as any
      const s = typeof m?.value === "string" ? m.value : Buffer.from(m?.value ?? "").toString("utf8")
      const decoded = s.startsWith("{") ? s : Buffer.from(s, "hex").toString("utf8")
      model = JSON.parse(decoded).lastUsedModel ?? null
    } catch {}

    let blobs: any[]
    try { blobs = db.prepare("SELECT id, data FROM blobs").all() as any[] } catch { return 0 }
    for (const b of blobs) {
      let o: any
      // Non-JSON blobs are the protobuf ordering chain. JSON message content is retained below,
      // but seq stays NULL until that chain has a stable local decoder.
      try { o = JSON.parse(Buffer.from(b.data).toString("utf8")) } catch { continue }
      if (typeof o.role !== "string") continue
      const blobId = String(b.id)
      const messageId = String(o.id ?? blobId)
      const role = o.role
      if (o.role === "assistant") {
        // blob ids are content-addressed (sha256) — prefix with sid to avoid cross-session PK collisions
        stmts.turn.run(`${sid}-${blobId.slice(0, 12)}`, sid, null, model, null, null, null, null, null)
        n++
      }

      const contentParts = Array.isArray(o.content)
        ? o.content
        : (typeof o.content === "string" ? [{ type: "text", text: o.content }] : [{ type: "content", value: o.content }])
      for (const [partIndex, rawPart] of contentParts.entries()) {
        const part = typeof rawPart === "string" ? { type: "text", text: rawPart } : (rawPart ?? {})
        const rawType = typeof part.type === "string" ? part.type : "content"
        const isReasoning = rawType === "reasoning" || rawType === "redacted-reasoning"
        const partType = isReasoning ? "reasoning" : rawType.replaceAll("-", "_")
        const toolCallId = part.toolCallId
          ? `${sid}-${part.toolCallId}`
          : ((rawType === "tool-call" || rawType === "tool-result") ? `${sid}-${blobId.slice(0, 12)}` : null)
        const toolName = textValue(part.toolName)
        let content: string | null = null
        let dataJson: string | null = null
        let isError = 0

        if (rawType === "text") {
          content = textValue(part.text)
          dataJson = part.providerOptions ? jsonValue({ providerOptions: part.providerOptions }) : null
        } else if (isReasoning) {
          content = textValue(part.text) ?? textValue(part.data)
          dataJson = jsonValue({
            sourceType: rawType,
            providerOptions: part.providerOptions,
          })
        } else if (rawType === "tool-call") {
          dataJson = jsonValue({
            args: part.args,
            providerOptions: part.providerOptions,
          })
          if (toolName && toolCallId) {
            stmts.tool.run(toolCallId, sid, null, toolName, null, null, null, null)
            n++
          }
        } else if (rawType === "tool-result") {
          content = textValue(part.result)
          isError = part.isError || part.is_error || part.error ? 1 : 0
          dataJson = jsonValue({
            result: typeof part.result === "string" ? undefined : part.result,
            experimental_content: part.experimental_content,
            providerOptions: part.providerOptions,
            error: part.error,
          })
          if (toolName && toolCallId) {
            stmts.tool.run(toolCallId, sid, null, toolName, null, null, null, null)
            if (isError) stmts.toolErr.run(content?.slice(0, 300) ?? null, toolCallId)
            n++
          }
        } else {
          dataJson = jsonValue(part.value ?? part)
        }

        if (o.role === "user" && cwd === null && content) {
          cwd = /Workspace Path: (.+)/.exec(content)?.[1]?.trim() ?? null
        }
        stmts.part.run(
          `cursor-agent:${sid}:${blobId}:${partIndex}`, sid, messageId, null, partIndex, null,
          role, partType, model, toolCallId, toolName, content, dataJson, isError,
        )
      }
    }
  } finally {
    db.close()
  }

  const startedAt = isoTimestamp(metaJson.createdAtMs)
  const endedAt = isoTimestamp(updated)
  stmts.session.run(sid, "main", null, null, encodeProject(cwd), cwd, null, null,
    startedAt, endedAt, path, "cursor-agent")
  if (updated) stmts.putState.run(statePath, updated)
  return n
}

// ===================== adapter: kimi-code =====================

const KIMI_ROOT = join(homedir(), ".kimi-code", "sessions")

// wd_<name>_<hash> → root path, from ~/.kimi-code/workspaces.json (lazy, one read per run)
let kimiWorkspaces: Record<string, string> | null = null
function kimiCwd(path: string): string | null {
  if (kimiWorkspaces === null) {
    kimiWorkspaces = {}
    try {
      const j = JSON.parse(readFileSync(join(homedir(), ".kimi-code", "workspaces.json"), "utf8"))
      for (const [k, v] of Object.entries(j.workspaces ?? {}) as [string, any][]) {
        if (v?.root) kimiWorkspaces[k] = v.root
      }
    } catch {}
  }
  const wd = path.split(sep).find(p => p.startsWith("wd_"))
  return (wd && kimiWorkspaces[wd]) || null
}

const kimiCode: Adapter = {
  name: "kimi-code",
  discover() { return scanGlob(KIMI_ROOT, "wd_*/session_*/agents/*/wire.jsonl") },
  ingest(stmts: Stmts) {
    let total = 0
    for (const path of this._files) {
      total += ingestKimiFile(path, stmts)
    }
    return total
  },
  _files: [] as string[],
}

function ingestKimiFile(path: string, stmts: Stmts): number {
  // .../sessions/wd_*/session_<uuid>/agents/<main|agent-N>/wire.jsonl
  const parts = path.split(sep)
  const agentDir = parts[parts.length - 2]
  const mainSid = parts[parts.length - 4].replace(/^session_/, "")
  const isMain = agentDir === "main"
  const sid = isMain ? mainSid : `${mainSid}-${agentDir}`

  const row = stmts.getState.get(path) as { offset: number } | null
  let offset = row?.offset ?? 0
  const { size } = statSync(path)
  if (size < offset) offset = 0
  if (size === offset) return 0

  const meta: Meta = { started_at: null, ended_at: null, cwd: kimiCwd(path), git_branch: null, cc_version: null, subagent_type: null }
  const buf: Buf = { turns: [], tools: [], toolErrs: [], slashes: [], hooks: [], hookErrs: [] }

  const fd = openSync(path, "r")
  const chunk = Buffer.allocUnsafe(size - offset)
  const bytesRead = readSync(fd, chunk, 0, size - offset, offset)
  closeSync(fd)
  const data = chunk.subarray(0, bytesRead)

  let currentModel: string | null = null
  let pos = 0
  let n = 0
  while (pos < data.length) {
    const nl = data.indexOf(10, pos)
    if (nl === -1) break
    const line = data.toString("utf8", pos, nl)
    pos = nl + 1
    let o: any
    try { o = JSON.parse(line) } catch { continue }
    n++

    const ts = isoTimestamp(o.time ?? o.created_at) // ms epoch on every event
    if (ts) {
      meta.started_at = meta.started_at && meta.started_at < ts ? meta.started_at : ts
      meta.ended_at = meta.ended_at && meta.ended_at > ts ? meta.ended_at : ts
    }

    if (o.type === "llm.request") {
      currentModel = o.model ?? currentModel // 'k3', not the 'kimi-code/k3' alias
    } else if (o.type === "usage.record") {
      const u = o.usage ?? {}
      const fallback = typeof o.model === "string" ? o.model.replace(/^kimi-code\//, "") : null
      buf.turns.push([
        `km-${sid}-${offset + pos}`, sid, ts, currentModel ?? fallback,
        u.inputOther ?? null, u.output ?? null,
        u.inputCacheRead ?? null, u.inputCacheCreation ?? null, null,
      ])
    } else if (o.type === "context.append_loop_event") {
      const ev = o.event ?? {}
      if (ev.type === "tool.call") {
        const name = ev.name ?? null
        const a = ev.args ?? {}
        const isAgent = name === "Agent" || name === "AgentSwarm"
        buf.tools.push([
          ev.toolCallId ?? `km-${sid}-${offset + pos}`, sid, ts, name,
          name === "Skill" ? (a.skill ?? null) : null,
          isAgent ? (a.subagent_type ?? a.agent_type ?? null) : null,
          isAgent ? (a.model ?? null) : null,
          a.run_in_background ? 1 : 0,
        ])
      } else if (ev.type === "tool.result") {
        const r = ev.result
        if (r && typeof r === "object" && ("error" in r || r.isError)) {
          const snippet = typeof r.error === "string" ? r.error : jsonValue(r.error)
          buf.toolErrs.push([snippet?.slice(0, 300) ?? null, ev.toolCallId ?? null])
        }
      }
    }
  }

  for (const t of buf.turns) stmts.turn.run(...t)
  for (const t of buf.tools) stmts.tool.run(...t)
  for (const t of buf.toolErrs) stmts.toolErr.run(...t)

  stmts.session.run(sid, isMain ? "main" : "subagent", isMain ? null : mainSid, null,
    encodeProject(meta.cwd), meta.cwd, null, null, meta.started_at, meta.ended_at, path, "kimi-code")
  stmts.putState.run(path, offset + pos)
  return n
}

// ===================== adapter type + registry =====================

type Adapter = {
  name: string
  discover(args: string[]): string[]
  ingest(stmts: Stmts): number
  _files: string[]
}

const ADAPTERS: Adapter[] = [claudeCode, codex, droid, grok, opencode, cursorIde, cursorAgent, kimiCode]

// ===================== main =====================

const args = process.argv.slice(2)
const db = connect()
const stmts = prepStmts(db)

// Source filter (if --source given, only run that adapter).
// --project and --queue are claude-code concepts — they imply that source.
const sourceIdx = args.indexOf("--source")
const sourceFilter = sourceIdx !== -1 ? args[sourceIdx + 1]
  : (args.includes("--project") || args.includes("--queue")) ? "claude-code" : null

// Collect files for each adapter
for (const a of ADAPTERS) {
  if (sourceFilter && a.name !== sourceFilter) continue
  a._files = a.discover(args)
}

let total = 0
const touched: string[] = []
db.exec("BEGIN")
for (const a of ADAPTERS) {
  if (sourceFilter && a.name !== sourceFilter) continue
  const n = a.ingest(stmts)
  if (n > 0) {
    touched.push(`${a.name}:${n}`)
    total += n
  }
}
db.exec("COMMIT")

// Backfill subagent_type for claude-code sessions whose JSONL predates the agentType field
if (!sourceFilter || sourceFilter === "claude-code") {
  db.exec(`
    UPDATE sessions SET subagent_type = (
      SELECT tc.subagent_type FROM tool_calls tc
      WHERE tc.session_id = sessions.parent_id AND tc.tool = 'Agent' AND tc.ts <= sessions.started_at
      ORDER BY tc.ts DESC LIMIT 1
    ) WHERE kind = 'subagent' AND subagent_type IS NULL AND parent_id IS NOT NULL`)
}
db.close()
const summary = `ccobs: ${touched.length ? touched.join(", ") : "no new data"} → ${DB_PATH}`
console.log(summary)
// every run (manual or launchd) leaves a timestamped line in the log file
try { appendFileSync(join(OBS_DIR, "ingest.log"), `${new Date().toISOString()} ${summary}\n`) } catch {}
