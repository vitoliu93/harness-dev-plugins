#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: on the first task prompt of a session, ask the model to
 * state its understanding in three marked lines before working. The user then
 * only corrects a guess instead of writing the whole brief; distill reads the
 * 【理解】 lines and the user's edits, and an edited line becomes a learned default.
 *
 * Skips slash/shell passthrough, acks, and prompts written by a dispatching agent
 * (task cards already carry goal, scope and done). Repeats until the transcript
 * shows the lines (at most 3 times; once when no transcript_path, e.g. Codex). Zero model
 * calls. Every injection appends one line to ${OBS_DIR}/understand.jsonl.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OBS_DIR } from "../../skills/ccobs/scripts/rules-digest.ts";

const MARK_DIR = join(OBS_DIR, "understand-fired");
const MARK_TTL_MS = 7 * 24 * 3600 * 1000;
const MIN_CHARS = 6;
const MAX_TRIES = 3; // a question first, the task later: keep offering until the lines appear
const ACK = /^(继续|continue|go( on)?|ok(ay)?|好的?|可以|行|嗯|yes|y|是的?|对|没问题|lgtm|谢谢|thanks?)[\s。.!！,，]*$/i;
// Written by a dispatching agent, not the user: same signals the 2026-10 prompt audit used.
export const CARD = /任务卡|角色卡|只回复(结果)?(文件)?路径|回复只写|最后一行[^\n]{0,8}DONE|你是(独立|外部|这条|第一次)|独立(审核|审计|reviewer|复核|验收)|card\.md|BRIEF\.md|Read and execute the complete/m;

export const PROTOCOL =
  "<understand-first>动手前，先用三行写出你对这个任务的理解，行首固定：\n" +
  "【理解】目标：<要解决什么>\n【理解】范围：<改哪里，哪里不碰>\n【理解】完成：<做到什么算完，怎么核对>\n" +
  "用户没说的部分，按项目规则、rolled-up rules 和最近会话去猜，猜的标「（猜）」。写完直接开工，不等确认；" +
  "只有猜错的代价不可逆（生产写入、删数据、花钱、对外发消息）时，才停下问一句。用户改了哪一行，就以改后的为准。" +
  "闲聊、一句话问答、纯查询，不写这三行。</understand-first>";

export function shouldFire(prompt: string): boolean {
  const p = prompt.trim();
  return p.length >= MIN_CHARS && !/^[\/!]/.test(p) && !ACK.test(p) && !CARD.test(p);
}

function run(payload: Record<string, any>): string | null {
  const prompt = String(payload.prompt ?? "");
  const sid = String(payload.session_id ?? "");
  // Dispatched agents (use-agents sets this) work from a task card, not from the user.
  if (process.env.DEVKIT_DELEGATED || !sid || !shouldFire(prompt)) return null;
  mkdirSync(MARK_DIR, { recursive: true });
  const mark = join(MARK_DIR, sid.replaceAll("/", "_"));
  const tries = existsSync(mark) ? Number(readFileSync(mark, "utf8")) || 1 : 0;
  const transcript = String(payload.transcript_path ?? "");
  const wrote = transcript && existsSync(transcript) && readFileSync(transcript, "utf8").includes("【理解】目标");
  if (tries >= (transcript ? MAX_TRIES : 1) || wrote) return null;
  writeFileSync(mark, String(tries + 1));
  for (const f of readdirSync(MARK_DIR)) {
    try { if (Date.now() - statSync(join(MARK_DIR, f)).mtimeMs > MARK_TTL_MS) unlinkSync(join(MARK_DIR, f)); } catch {}
  }
  try {
    appendFileSync(join(OBS_DIR, "understand.jsonl"), JSON.stringify({ ts: new Date().toISOString(), session_id: sid, cwd: payload.cwd, prompt_chars: prompt.trim().length }) + "\n");
  } catch { /* best-effort */ }
  return PROTOCOL;
}

if (import.meta.main) {
  try {
    const block = run(JSON.parse(await Bun.stdin.text()));
    if (block) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: block } }));
  } catch {
    // fail-open: never block the prompt
  }
  process.exit(0);
}
