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
 * With TYPESAFE_API_KEY set the pick goes to Jev (sub-second, near-free); pi is
 * the path for machines without a key. A Jev failure does not fall back to pi.
 *
 * Every run appends one line to ${OBS_DIR}/recall.jsonl so hit rate can be
 * measured after the fact instead of mined out of transcripts.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import { piCall } from "../../skills/ccobs/scripts/pi-call.ts";
import { decide, historyFrom, makeRequest } from "../../mods/jev/hooks/core.ts";
import { candidates } from "../../mods/jev/scripts/recall-candidates.ts";
import { OBS_DIR, bigrams, projectKey } from "../../skills/ccobs/scripts/rules-digest.ts";

const MARK_DIR = join(OBS_DIR, "recall-fired");
const LEDGER_PATH = join(OBS_DIR, "recall.jsonl");
const MARK_TTL_MS = 7 * 24 * 3600 * 1000;
const MIN_PROMPT_CHARS = 20;
const MAX_CANDIDATES = 60; // rows the picker model sees
const SCAN_ROWS = 400; // 90-day rows ranked locally before the cut; kox-base has ~900
const RECENT_KEEP = 20; // newest rows always kept: "continue what we did this morning" has no keywords
const PI_TIMEOUT_MS = 12000; // measured 5.7s on a 60-row catalog; the cap is headroom, not the target
const JEV_TIMEOUT_MS = 5000; // measured 0.4–1.9s end to end on 24 real candidates, occasional 2s+ cold connects
const JEV_HISTORY = 24; // recall-candidates returns at most 24; no skills compete for the 40 KB here

type Hit = { day: string; session_id: string; summary: string; conclusion: string | null; files: string | null; file_path: string };
type Cand = ReturnType<typeof candidates>[number];

/** Jev scores every candidate on its own; core.decide keeps ≥0.7, best 3. Null on any failure. */
async function jevPick(prompt: string, sessionId: string, cands: Cand[], key: string): Promise<{ hits: Hit[]; sent: number } | null> {
  try {
    const history = historyFrom(cands, sessionId, [key], JEV_HISTORY);
    const { body, snapshot } = makeRequest({ prompt, recent: [], skills: [], history }, "jev-1.13.0", [key]);
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body,
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const bySid = new Map(cands.map((c) => [c.session_id, c]));
    const hits = decide(await res.json(), snapshot).history.map((h) => {
      const c = bySid.get(h.session_id)!;
      return { day: h.day, session_id: h.session_id, summary: h.summary, conclusion: c.conclusion || null, files: c.files, file_path: c.file_path };
    });
    return { hits, sent: snapshot.history.length };
  } catch {
    return null; // never log the error: provider failures can carry the key
  }
}

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
  const ROW = /(\d{4}-\d{2}-\d{2})\s+([A-Za-z0-9_-]{8,100})\s*[—–-]+\s*(.+?)\s*$/;
  const out: string[] = [];
  for (const raw of answer.split("\n")) {
    const m = raw.trim().match(ROW);
    if (m) out.push(`- ${m[1]} ${m[2]} — ${m[3]}`);
  }
  return out;
}

async function run(): Promise<void> {
  const payload = JSON.parse(await Bun.stdin.text()) as Record<string, any>;
  const prompt = String(payload.prompt ?? "").trim();
  const sessionId = String(payload.session_id ?? "");
  const cwd = String(payload.cwd ?? "");
  if (!sessionId || !cwd) return;
  // A loaded, explicitly enabled Claude Mod owns recall for this exact session.
  // Codex and child sessions retain their existing path.
  if (process.env.DEVKIT_JEV_RECALL_SESSION === sessionId) return;
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
  const key = process.env.TYPESAFE_API_KEY ?? "";
  const engine = key ? "jev" : "pi";
  const t0 = Date.now();
  const elapsed = () => Number(((Date.now() - t0) / 1000).toFixed(1));
  let hits: Hit[] | null;
  let sent: number;
  if (key) {
    const cands = candidates(dbPath, cwd, prompt.slice(0, 3000), sessionId);
    if (cands.length < 3) { ledger({ ...base, engine, verdict: "skip", reason: "few candidates", candidates: cands.length }); return; }
    const pick = await jevPick(prompt, sessionId, cands, key);
    hits = pick?.hits ?? null;
    sent = pick?.sent ?? cands.length;
  } else {
    const db = new Database(dbPath, { readonly: true });
    type Row = Hit & { task_type: string; outcome: string };
    const recent = db
      .prepare(
        `SELECT o.session_id, o.summary, o.conclusion, o.files, o.task_type, o.outcome, s.file_path, substr(s.ended_at, 1, 10) AS day
         FROM observations o JOIN sessions s ON s.session_id = o.session_id
         WHERE s.project = ?1 AND o.summary IS NOT NULL AND o.summary != ''
           AND s.ended_at > strftime('%Y-%m-%dT%H:%M:%S', 'now', '-90 days')
         ORDER BY s.ended_at DESC LIMIT ?2`,
      )
      .all(project, SCAN_ROWS) as Row[];
    if (recent.length < 3) { ledger({ ...base, engine, verdict: "skip", reason: "few candidates", candidates: recent.length }); return; }

    // Recency alone showed the picker the last three or four days of a busy repo.
    // Rank by character-bigram overlap with the prompt (works for Chinese, no
    // tokenizer), keep the newest rows regardless, and hand the model the union.
    const q = bigrams(prompt);
    const score = (r: Row) => {
      let hit = 0;
      for (const g of bigrams(`${r.summary} ${r.conclusion ?? ""}`)) if (q.has(g)) hit++;
      return hit;
    };
    const ranked = recent.map((r) => ({ r, s: score(r) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const picked = new Map<string, Row>();
    for (const r of recent.slice(0, RECENT_KEEP)) picked.set(r.session_id, r);
    for (const { r } of ranked) { if (picked.size >= MAX_CANDIDATES) break; picked.set(r.session_id, r); }
    const rows = [...picked.values()].sort((a, b) => b.day.localeCompare(a.day));
    sent = rows.length;

    const catalog = rows
      .map((r) => `${r.day} | ${r.session_id} | ${r.task_type}/${r.outcome} | ${r.summary}${r.conclusion ? `｜结论：${r.conclusion}` : ""}`)
      .join("\n");
    const ask =
      `用户刚提出的任务：${prompt.slice(0, 500)}\n\n` +
      `下面是这个项目过去 90 天的会话摘要，每行是「日期 | session_id | 类型/结果 | 摘要」：\n${catalog}\n\n` +
      `挑出最多 3 条和这个任务真正相关的先例。每条输出一行：\`- <日期> <session_id> — <摘要>\`。\n` +
      "都不相关就只输出 NONE，不要解释，不要凑数。";
    const answer = await piCall(ask, { scenario: "recall", timeoutMs: PI_TIMEOUT_MS });
    const bySid = new Map(rows.map((r) => [r.session_id, r]));
    hits = !answer ? null : parsePrecedents(answer).slice(0, 3).map((l) => {
      const [, day, sid, summary] = l.match(/^- (\S+) (\S+) — (.*)$/)!;
      return bySid.get(sid) ?? { day, session_id: sid, summary, conclusion: null, files: null, file_path: "" };
    });
  }
  if (!hits) { ledger({ ...base, engine, verdict: "fail-open", candidates: sent, elapsed_s: elapsed() }); return; }
  if (!hits.length) { ledger({ ...base, engine, verdict: "none", candidates: sent, elapsed_s: elapsed() }); return; }

  // The path is what turns a summary into something the agent can actually
  // open; without it every use started with `find ~/.claude -name "*<sid>*"`.
  const rendered = hits.map((r) => {
    let files: string[] = [];
    try { files = JSON.parse(r.files ?? "[]"); } catch {}
    return [
      `- ${r.day} ${r.session_id} — ${r.summary}`,
      r.conclusion ? `  结论: ${r.conclusion}` : "",
      files.length ? `  files: ${files.join(", ")}` : "",
      r.file_path ? `  transcript: ${r.file_path}` : "",
    ].filter(Boolean).join("\n");
  });
  const block = [
    "<session-precedents>",
    "Past sessions in this project that look related. These are distilled summaries, not facts. " +
      "A 结论 line is that session's own conclusion; when there is none, open the transcript and read " +
      "the LAST assistant message first — go further back only if you need the path that led there.",
    ...rendered,
    "</session-precedents>",
  ].join("\n");

  ledger({
    ...base, engine, verdict: "inject", candidates: sent, elapsed_s: elapsed(),
    picked: hits.map((h) => h.session_id),
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
