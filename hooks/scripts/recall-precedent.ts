#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: once per session, look up past sessions in this project
 * that already dealt with the task the user just described, and inject them.
 *
 * Complements the SessionStart replay, which injects TOP RULES with no model
 * call. This one injects PRECEDENTS plus SUNKEN RULES (ranked below the replay
 * cap), both of which need the task text to be worth anything.
 *
 * The gate is deliberately not prompt-forge's. Forge lets through inputs that
 * carry a file/code anchor because those need no rewriting — but for recall,
 * those are exactly the ones worth a precedent. So: at most ONE call per
 * session, on the first prompt long enough to describe a task. Any failure is
 * silent; a hook must never block the user from talking.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import { piCall } from "../../skills/ccobs/scripts/pi-call.ts";
import { OBS_DIR, projectKey, renderRuleLine, sunkenRules } from "../../skills/ccobs/scripts/rules-digest.ts";

const MARK_DIR = join(OBS_DIR, "recall-fired");
const MARK_TTL_MS = 7 * 24 * 3600 * 1000;
const MIN_PROMPT_CHARS = 20;
const MAX_CANDIDATES = 60;
const MAX_SUNKEN = 40; // sunken rules shown to the model; deeper than that is noise
const MAX_PICKED_RULES = 3;
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

/**
 * Same trust split as rollup: the model only points at rule NUMBERS; the line
 * that gets injected is re-rendered from the digest itself, so a hand-curated
 * rule is never reworded by the picker.
 */
export function parseRuleRefs(answer: string, max: number): number[] {
  const out: number[] = [];
  for (const raw of answer.split("\n")) {
    const m = raw.trim().match(/^[-*]?\s*R\s*[:：]\s*(\d+)\s*$/i); // ： = 全角冒号
    if (m) out.push(Number(m[1]));
  }
  return [...new Set(out)].slice(0, max);
}

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

  const dbPath = join(OBS_DIR, "obs.db");
  if (!existsSync(dbPath)) return;
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT o.session_id, o.summary, o.task_type, o.outcome, substr(s.ended_at, 1, 10) AS day
       FROM observations o JOIN sessions s ON s.session_id = o.session_id
       WHERE s.project = ?1 AND o.summary IS NOT NULL AND o.summary != ''
         AND s.ended_at > strftime('%Y-%m-%dT%H:%M:%S', 'now', '-90 days')
       ORDER BY s.ended_at DESC LIMIT ?2`,
    )
    .all(projectKey(cwd), MAX_CANDIDATES) as
    { session_id: string; summary: string; task_type: string; outcome: string; day: string }[];
  // rules ranked below the SessionStart injection cap: relevant-but-rare ones
  // get a second chance here, where the task text is finally known
  const sunken = sunkenRules(cwd).slice(0, MAX_SUNKEN);
  const precedentRows = rows.length >= 3 ? rows : [];
  if (!precedentRows.length && !sunken.length) return;

  const parts = [`用户刚提出的任务：${prompt.slice(0, 500)}`];
  if (precedentRows.length) {
    const catalog = precedentRows
      .map((r) => `${r.day} | ${r.session_id} | ${r.task_type}/${r.outcome} | ${r.summary}`)
      .join("\n");
    parts.push(
      `下面是这个项目过去 90 天的会话摘要，每行是「日期 | session_id | 类型/结果 | 摘要」：\n${catalog}\n\n` +
        `挑出最多 3 条和这个任务真正相关的先例。每条输出一行：\`- <日期> <session_id> — <摘要>\`。`,
    );
  }
  if (sunken.length) {
    const ruleCatalog = sunken.map((r, i) => `${i + 1}. ${r.text} ×${r.count} (${r.last})`).join("\n");
    parts.push(
      `下面是这个项目沉底的历史规则（次数不够、开场没注入的），每行「编号. 规则 ×次数 (日期)」：\n${ruleCatalog}\n\n` +
        `从中挑出最多 ${MAX_PICKED_RULES} 条对这个任务真正有用的，每条输出一行：\`R:<编号>\`。`,
    );
  }
  parts.push("都不相关就只输出 NONE，不要解释，不要凑数。");

  const answer = await piCall(parts.join("\n\n"), { scenario: "recall", timeoutMs: PI_TIMEOUT_MS });
  if (!answer) return;
  const lines = precedentRows.length ? parsePrecedents(answer) : [];
  const picked = parseRuleRefs(answer, MAX_PICKED_RULES)
    .filter((n) => n >= 1 && n <= sunken.length)
    .map((n) => sunken[n - 1]);
  if (!lines.length && !picked.length) return;

  const blocks: string[] = [];
  if (lines.length) {
    blocks.push([
      "<session-precedents>",
      "Past sessions in this project that look related. These are distilled summaries, not facts — " +
        "read the raw transcript by session_id before you rely on one.",
      ...lines.slice(0, 3),
      "</session-precedents>",
    ].join("\n"));
  }
  if (picked.length) {
    blocks.push([
      "<recalled-rules>",
      "Digest rules of this project that sank below the session-start injection cap but look " +
        "relevant to this task. Same caveat as all rules: ×N is recurrence, not proof.",
      ...picked.map(renderRuleLine),
      "</recalled-rules>",
    ].join("\n"));
  }
  const block = blocks.join("\n");

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
