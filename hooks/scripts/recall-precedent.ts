#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: once per session, look up past sessions in this project
 * that already dealt with the task the user just described, and inject them.
 *
 * Complements the SessionStart replay, which injects RULES with no model call.
 * This one injects PRECEDENTS, which need the task text to be worth anything.
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
import { OBS_DIR, projectKey } from "../../skills/ccobs/scripts/rules-digest.ts";

const MARK_DIR = join(OBS_DIR, "recall-fired");
const MARK_TTL_MS = 7 * 24 * 3600 * 1000;
const MIN_PROMPT_CHARS = 20;
const MAX_CANDIDATES = 60;
const PI_TIMEOUT_MS = 12000; // measured 3.4–3.7s on a 60-row catalog; the cap is headroom, not the target

function sweepMarkers(): void {
  const now = Date.now();
  for (const f of readdirSync(MARK_DIR)) {
    const p = join(MARK_DIR, f);
    try {
      if (now - statSync(p).mtimeMs > MARK_TTL_MS) unlinkSync(p);
    } catch {}
  }
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
  if (rows.length < 3) return;

  const catalog = rows
    .map((r) => `${r.day} | ${r.session_id} | ${r.task_type}/${r.outcome} | ${r.summary}`)
    .join("\n");
  const answer = await piCall(
    `用户刚提出的任务：${prompt.slice(0, 500)}\n\n` +
      `下面是这个项目过去 90 天的会话摘要，每行是「日期 | session_id | 类型/结果 | 摘要」：\n${catalog}\n\n` +
      `挑出最多 3 条和这个任务真正相关的先例。每条输出一行：\`- <日期> <session_id> — <摘要>\`。` +
      `一条都不相关就只输出 NONE，不要解释，不要凑数。`,
    { timeoutMs: PI_TIMEOUT_MS },
  );
  if (!answer) return;
  const lines = answer.split("\n").filter((l) => l.trim().startsWith("- "));
  if (!lines.length) return;

  // JSON, not plain stdout: on UserPromptSubmit plain stdout does NOT reach the
  // model (verified live — the hook ran, the text never landed). SessionStart is
  // the opposite; see session-replay.ts.
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: [
        "<session-precedents>",
        "Past sessions in this project that look related. These are distilled summaries, not facts — " +
          "read the raw transcript by session_id before you rely on one.",
        ...lines.slice(0, 3),
        "</session-precedents>",
      ].join("\n"),
    },
  }));
}

try {
  await run();
} catch {
  // fail-open: never block the prompt
}
process.exit(0);
