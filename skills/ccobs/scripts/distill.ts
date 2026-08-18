#!/usr/bin/env bun
// ccobs distill runner — semantic layer. Reads undistilled main sessions from obs.db,
// digests their raw JSONL (user text + assistant text + tool names, NO tool outputs),
// asks a cheap OpenAI-compatible model to fill the observations table.
//
// Provider resolution (all OpenAI-compatible), first hit wins:
//   1. ~/.claude/observability/llm.json {"base_url","model","api_key"} — explicit override
//   2. env keys, in order: DEEPSEEK_API_KEY > GEMINI_API_KEY > OPENROUTER_API_KEY > LMSTUDIO_API_KEY
//   3. neither → skip quietly
//
// Usage:
//   bun distill.ts                  # distill up to 50 pending sessions
//   bun distill.ts --limit 5
//   bun distill.ts --dry-run        # print digest+prompt for one session, call nothing
//   bun distill.ts --session <id>   # redo one session (e.g. after prompt/model swap)

import { Database } from "bun:sqlite";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OBS_DIR = process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability");
const DB_PATH = join(OBS_DIR, "obs.db");
const CONFIG = join(OBS_DIR, "llm.json");
const PROMPT_TPL = readFileSync(join(import.meta.dir, "distill-prompt.md"), "utf8");
const DIGEST_CAP = 20_000; // chars; keep head+tail, endings decide `outcome`

const PROVIDERS = [
  { env: "DEEPSEEK_API_KEY", base_url: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" },
  { env: "GEMINI_API_KEY", base_url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.1-flash-lite" },
  { env: "OPENROUTER_API_KEY", base_url: "https://openrouter.ai/api/v1", model: "openrouter/free" },
  { env: "LMSTUDIO_API_KEY", base_url: "http://localhost:1234/v1", model: "local" },
];

function resolveCfg(): { base_url: string; model: string; api_key: string } | null {
  if (existsSync(CONFIG)) return JSON.parse(readFileSync(CONFIG, "utf8"));
  for (const p of PROVIDERS) {
    const key = process.env[p.env];
    if (key) return { base_url: p.base_url, model: p.model, api_key: key };
  }
  return null;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};

function buildDigest(filePath: string): string {
  const lines: string[] = [];
  for (const raw of readFileSync(filePath, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(raw);
    } catch {
      continue;
    }
    const m = o.message ?? {};
    if (o.type === "user") {
      const texts: string[] = [];
      if (typeof m.content === "string") texts.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const c of m.content) if (c?.type === "text" && c.text) texts.push(c.text);
      }
      for (const t of texts) {
        if (t.startsWith("<system-reminder") || t.includes('"type":"tool_result"')) continue;
        lines.push(`[用户] ${t.slice(0, 600)}`);
      }
    } else if (o.type === "assistant") {
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c?.type === "text" && c.text) lines.push(`[助手] ${c.text.slice(0, 400)}`);
        else if (c?.type === "tool_use") {
          const inp = c.input ?? {};
          const detail =
            c.name === "Skill" ? `:${inp.skill}` :
            c.name === "Agent" || c.name === "Task" ? `:${inp.subagent_type}(model=${inp.model ?? "缺省"})` : "";
          lines.push(`→ ${c.name}${detail}`);
        }
      }
    }
  }
  const full = lines.join("\n");
  if (full.length <= DIGEST_CAP) return full;
  return full.slice(0, DIGEST_CAP * 0.6) + "\n...[中段截断]...\n" + full.slice(-DIGEST_CAP * 0.4);
}

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

const db = new Database(DB_PATH);
try { db.exec("ALTER TABLE observations ADD COLUMN sop_candidate TEXT"); } catch {} // 存量库迁移;已有则跳过
const sessionFilter = opt("--session");
const pending = db
  .prepare(
    `SELECT s.session_id, s.file_path, s.ended_at
     FROM sessions s LEFT JOIN observations o ON o.session_id = s.session_id
     WHERE s.kind = 'main'
       AND s.source = 'claude-code' -- digest 解析器只认 Claude 式 JSONL;Cursor 的 state.vscdb(2.8GB 二进制)曾把整条管线 SIGTRAP 打死两周
       AND (?1 IS NOT NULL AND s.session_id = ?1
            OR ?1 IS NULL AND o.session_id IS NULL
               AND s.ended_at < strftime('%Y-%m-%dT%H:%M:%S', 'now', '-30 minutes')
               AND (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.session_id) >= 3)
     ORDER BY s.ended_at DESC LIMIT ?2`,
  )
  .all(sessionFilter, flag("--dry-run") ? 1 : Number(opt("--limit") ?? 50)) as
  { session_id: string; file_path: string; ended_at: string }[];

if (pending.length === 0) {
  console.log("ccobs distill: nothing pending");
  writeFileSync(join(OBS_DIR, "distill.heartbeat"), new Date().toISOString());
  process.exit(0);
}

if (flag("--dry-run")) {
  const s = pending[0];
  const digest = buildDigest(s.file_path);
  console.log(`# session ${s.session_id} (${s.ended_at})\n`);
  console.log(PROMPT_TPL.replace("{{TRANSCRIPT_DIGEST}}", digest));
  process.exit(0);
}

const cfg = resolveCfg();
if (!cfg) {
  console.log("ccobs distill: 无 llm.json 且四个 *_API_KEY 环境变量均未设置，跳过");
  process.exit(0);
}
const put = db.prepare(
  `INSERT OR REPLACE INTO observations
   (session_id, distilled_at, distill_model, task_type, outcome, corrections,
    dispatch_engine, dispatch_result, summary, learn_candidates, sop_candidate)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
);

let ok = 0;
let failed = 0;
for (const s of pending) {
  if (!existsSync(s.file_path)) continue; // retention already ate the raw file
  if (statSync(s.file_path).size > 128 * 1024 * 1024) { // readFileSync 巨文件是不可 catch 的原生崩溃,门口拦掉
    failed++;
    console.error(`  ${s.session_id}: skipped, file > 128MB (${s.file_path})`);
    continue;
  }
  try {
    const res = await fetch(`${cfg.base_url}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: {
        "Content-Type": "application/json",
        ...(cfg.api_key ? { Authorization: `Bearer ${cfg.api_key}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [{ role: "user", content: PROMPT_TPL.replace("{{TRANSCRIPT_DIGEST}}", buildDigest(s.file_path)) }],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body: any = await res.json();
    const j = extractJson(body.choices[0].message.content);
    if (!j.task_type || !j.outcome || j.summary == null) throw new Error("missing required fields");
    put.run(
      s.session_id, new Date().toISOString(), cfg.model,
      j.task_type, j.outcome, Number(j.corrections ?? 0),
      j.dispatch_engine ?? null, j.dispatch_result ?? null,
      String(j.summary).slice(0, 200), JSON.stringify(j.learn_candidates ?? []),
      j.sop_candidate ? String(j.sop_candidate).slice(0, 60) : null,
    );
    ok++;
  } catch (e) {
    failed++; // left undistilled; retried next run
    console.error(`  ${s.session_id}: ${e}`);
  }
}
console.log(`ccobs distill: ${ok} ok, ${failed} failed, model=${cfg.model}`);
// 心跳:跑到这一行才算活着(2026-07-22 起 SIGTRAP 死两周无人知的学费);session-replay hook 检查此文件的年龄
writeFileSync(join(OBS_DIR, "distill.heartbeat"), new Date().toISOString());
