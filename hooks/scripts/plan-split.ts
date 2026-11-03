#!/usr/bin/env bun
/**
 * PostToolUse(plan and look tools) hook: once per user turn, after the model has
 * looked around (3+ other tool calls), ask for one `拆分：` line: which parts are
 * independent and big enough to run on parallel agents, or why it stays serial.
 * With a plan this turn it waits for a plan update and needs 3+ items; without one
 * (Claude Code leaves the task tools out on newer models) it fires on a look tool.
 *
 * The model already lists the independent parts in its own plan (three tickets as
 * three items) and then does them one by one; nothing makes it decide. Replaying
 * 60 real plan turns with opus (2026-11-03), after the code was read: turns that
 * should have been split went from 0/10 to 7/10 and 6/10 split (two runs);
 * sequential turns from 0/40 to 3/40 and 1/40. Before reading code only 3/10:
 * the model says it will decide after reading, so the first plan write is too
 * early. Without a plan shown (same probe): should-split 0/10 -> 5/10, sequential
 * 0/40 -> 2/40, small tasks with no plan 0/24 -> 0/24.
 * Data and scripts: ~/.claude/observability/jev-eval/.
 *
 * Skips dispatched agents (DEVKIT_DELEGATED). Zero model calls.
 */

import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OBS_DIR } from "../../skills/ccobs/scripts/rules-digest.ts";

const MARK_DIR = join(OBS_DIR, "split-fired");
const MIN_ITEMS = 3;
const MIN_LOOKS = 3; // other tool calls this turn before the hint can help
const TAIL_BYTES = 4 * 1024 * 1024;

export const hint = (n: number) =>
  `${n ? `计划有 ${n} 项。` : ""}写一行 \`拆分：\`，列出${n ? "" : "这个任务里"}互相独立、各自超过十分钟、不改同一批文件的${n ? "项" : "部分"}；≥2 项就用 orchestrate 并行，否则写明串行的原因。一个脚本能循环完成的重复项不算。`;

function tailLines(path: string): any[] {
  if (!path || !existsSync(path)) return [];
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString("utf8").split("\n").flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
  } finally { closeSync(fd); }
}

const promptText = (j: any): string | null => {
  if (j?.type !== "user" || j.userType !== "external" || j.isMeta || j.isSidechain) return null;
  const c = j.message?.content;
  const t = typeof c === "string" ? c : Array.isArray(c) ? c.find((x: any) => x.type === "text")?.text : undefined;
  return typeof t === "string" && !/^\s*</.test(t) ? t : null;
};

const PLAN = new Set(["mcp__ccd_turn__update_plan", "TodoWrite", "TaskCreate", "TaskUpdate", "update_plan"]);
const LOOK = new Set(["Read", "Grep", "Glob", "Bash"]);

/** Items in a plan write; 0 for an update that writes none (`advance`, TaskUpdate). */
function written(tool: string, input: any): number {
  if (tool === "mcp__ccd_turn__update_plan") return Array.isArray(input?.items) ? input.items.length : 0;
  if (tool === "TodoWrite") return Array.isArray(input?.todos) ? input.todos.length : 0;
  if (tool === "update_plan") return Array.isArray(input?.plan) ? input.plan.length : 0; // Codex
  return 0;
}

/** This user turn: its prompt's uuid, the latest plan size (TaskCreate counts one each), whether a plan tool ran, and other tool calls. */
export function turnOf(lines: any[]): { key: string; items: number; planned: boolean; looks: number } {
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (promptText(lines[i]) !== null) { start = i; break; }
  let items = 0, tasks = 0, looks = 0, planned = false;
  for (const j of lines.slice(start + 1)) {
    if (j.type !== "assistant" || !Array.isArray(j.message?.content)) continue;
    for (const c of j.message.content) {
      if (c.type !== "tool_use") continue;
      if (!PLAN.has(c.name)) { looks++; continue; }
      planned = true;
      if (c.name === "TaskCreate") items = ++tasks;
      else items = written(c.name, c.input) || items;
    }
  }
  return { key: start < 0 ? "" : String(lines[start].uuid ?? lines[start].timestamp ?? start), items, planned, looks };
}

export function run(payload: Record<string, any>): string | null {
  const sid = String(payload.session_id ?? "");
  if (process.env.DEVKIT_DELEGATED || !sid) return null;
  const lines = tailLines(String(payload.transcript_path ?? ""));
  const tool = String(payload.tool_name ?? "");
  const plan = PLAN.has(tool);
  if (!plan && !LOOK.has(tool)) return null;
  const { key, items, planned, looks } = turnOf(lines);
  if (looks < MIN_LOOKS) return null;
  // The transcript can lag this very call; its own plan write counts first.
  const n = plan || planned ? written(tool, payload.tool_input) || items : 0;
  if ((plan || planned) && (!plan || n < MIN_ITEMS)) return null; // a planned turn waits for a plan update
  mkdirSync(MARK_DIR, { recursive: true });
  const mark = join(MARK_DIR, sid.replaceAll("/", "_"));
  const turn = key || "no-transcript";
  if (existsSync(mark) && readFileSync(mark, "utf8") === turn) return null;
  writeFileSync(mark, turn);
  return hint(n);
}

if (import.meta.main) {
  try {
    const text = run(JSON.parse(await Bun.stdin.text()));
    if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } }));
  } catch {
    // fail-open: never break the tool call
  }
  process.exit(0);
}
