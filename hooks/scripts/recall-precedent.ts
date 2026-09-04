#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: once per session, look up past sessions in this project
 * that already dealt with the task the user just described, and inject them.
 *
 * Complements the SessionStart replay, which injects RULES with no model call.
 * This one injects PRECEDENTS, which need the task text to be worth anything.
 *
 * At most ONE call per session, on the first prompt long enough to describe a
 * task. Any failure is silent; a hook must never block the user from talking.
 *
 * Every run appends one line to ${OBS_DIR}/recall.jsonl so hit rate can be
 * measured after the fact instead of mined out of transcripts.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import { piCall } from "../../skills/ccobs/scripts/pi-call.ts";
import { OBS_DIR, projectKey } from "../../skills/ccobs/scripts/rules-digest.ts";

const MARK_DIR = join(OBS_DIR, "recall-fired");
const LEDGER_PATH = join(OBS_DIR, "recall.jsonl");
const MARK_TTL_MS = 7 * 24 * 3600 * 1000;
const MIN_PROMPT_CHARS = 20;
const MAX_CANDIDATES = 60;
const PI_TIMEOUT_MS = 12000; // measured 5.7s on a 60-row catalog; the cap is headroom, not the target

function sweepMarkers(): void {
  const now = Date.now();
  for (const f of readdirSync(MARK_DIR)) {
    const p = join(MARK_DIR, f);
    try {
      if (now - statSync(p).mtimeMs > MARK_TTL_MS) unlinkSync(p);
    } catch {}
  }
}

function ledger(fields: Record<string, unknown>): void {
  try {
    appendFileSync(LEDGER_PATH, JSON.stringify({ ts: new Date().toISOString(), ...fields }) + "\n");
  } catch { /* best-effort */ }
}

/**
 * Pull precedent rows out of whatever the model actually said. Matching on a
 * literal "- " prefix was too brittle: the same model that returns the exact
 * asked-for format most of the time will occasionally drop the bullet, use a
 * different one, or answer "没有。" in prose. Shape is the reliable signal —
 * date, session id, summary — so key on that and re-render the line ourselves.
 */
export function parsePrecedents(answer: string): string[] {
  const ROW = /(\d{4}-\d{2}-\d{2})\s+([0-9a-f]{8}-[0-9a-f-]+)\s*[—–-]+\s*(.+?)\s*$/;
  const out: string[] = [];
  for (const raw of answer.split("\n")) {
    const m = raw.trim().match(ROW);
    if (m) out.push(`- ${m[1]} ${m[2]} — ${m[3]}`);
  }
  return out;
}

const SID_IN_LINE = /^- \d{4}-\d{2}-\d{2} ([0-9a-f-]+) /;

async function run(): Promise<void> {
  const payload = JSON.parse(await Bun.stdin.text()) as Record<string, any>;
  const prompt = String(payload.prompt ?? "").trim();
  const sessionId = String(payload.session_id ?? "");
  const cwd = String(payload.cwd ?? "");
  if (!sessionId || !cwd) return;
  if (prompt.length < MIN_PROMPT_CHARS) return; // "继续" / "ok" carry no task
  if (prompt.startsWith("/") || prompt.startsWith("!")) return; // slash command / shell passthrough

  mkdirSync(MARK_DIR, { recursive: true });
  const mark = join(MARK_DIR, sessionId.replaceAll("/", "_"));
  if (existsSync(mark)) return;
  writeFileSync(mark, ""); // written BEFORE the call: a failure must not retry on every message
  sweepMarkers();

  const project = projectKey(cwd);
  const base = { session_id: sessionId, project, prompt_chars: prompt.length };
  const dbPath = join(OBS_DIR, "obs.db");
  if (!existsSync(dbPath)) { ledger({ ...base, verdict: "skip", reason: "no obs.db" }); return; }
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT o.session_id, o.summary, o.task_type, o.outcome, s.file_path, substr(s.ended_at, 1, 10) AS day
       FROM observations o JOIN sessions s ON s.session_id = o.session_id
       WHERE s.project = ?1 AND o.summary IS NOT NULL AND o.summary != ''
         AND s.ended_at > strftime('%Y-%m-%dT%H:%M:%S', 'now', '-90 days')
       ORDER BY s.ended_at DESC LIMIT ?2`,
    )
    .all(project, MAX_CANDIDATES) as
    { session_id: string; summary: string; task_type: string; outcome: string; file_path: string; day: string }[];
  if (rows.length < 3) { ledger({ ...base, verdict: "skip", reason: "few candidates", candidates: rows.length }); return; }

  const catalog = rows
    .map((r) => `${r.day} | ${r.session_id} | ${r.task_type}/${r.outcome} | ${r.summary}`)
    .join("\n");
  const ask =
    `用户刚提出的任务：${prompt.slice(0, 500)}\n\n` +
    `下面是这个项目过去 90 天的会话摘要，每行是「日期 | session_id | 类型/结果 | 摘要」：\n${catalog}\n\n` +
    `挑出最多 3 条和这个任务真正相关的先例。每条输出一行：\`- <日期> <session_id> — <摘要>\`。\n` +
    "都不相关就只输出 NONE，不要解释，不要凑数。";

  const t0 = Date.now();
  const answer = await piCall(ask, { scenario: "recall", timeoutMs: PI_TIMEOUT_MS });
  const elapsed_s = Number(((Date.now() - t0) / 1000).toFixed(1));
  if (!answer) { ledger({ ...base, verdict: "fail-open", candidates: rows.length, elapsed_s }); return; }
  const lines = parsePrecedents(answer).slice(0, 3);
  if (!lines.length) { ledger({ ...base, verdict: "none", candidates: rows.length, elapsed_s }); return; }

  // The path is what turns a summary into something the agent can actually
  // open; without it every use started with `find ~/.claude -name "*<sid>*"`.
  const pathBySid = new Map(rows.map((r) => [r.session_id, r.file_path]));
  const rendered = lines.map((l) => {
    const sid = SID_IN_LINE.exec(l)?.[1];
    const p = sid ? pathBySid.get(sid) : undefined;
    return p ? `${l}\n  transcript: ${p}` : l;
  });
  const block = [
    "<session-precedents>",
    "Past sessions in this project that look related. These are distilled summaries, not facts. " +
      "To use one, open its transcript and read the LAST assistant message first — that is the " +
      "conclusion; go further back only if you need the path that led there.",
    ...rendered,
    "</session-precedents>",
  ].join("\n");

  ledger({
    ...base, verdict: "inject", candidates: rows.length, elapsed_s,
    picked: lines.map((l) => SID_IN_LINE.exec(l)?.[1] ?? "?"),
  });
  // JSON on both clients, verified live. Plain stdout does NOT reach the model on
  // UserPromptSubmit — not on Claude Code, and Codex reads hookSpecificOutput here
  // too, so no per-client branch is needed. SessionStart is the opposite case and
  // must stay plain stdout; see session-replay.ts.
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: block },
  }));
}

if (import.meta.main) {
  try {
    await run();
  } catch {
    // fail-open: never block the prompt
  }
  process.exit(0);
}
