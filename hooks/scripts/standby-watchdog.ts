#!/usr/bin/env bun
/**
 * Stop hook: don't park the session in a silent "waiting for X" state.
 *
 * Failure this exists for: a session ended a turn with "standing by for the
 * re-render", the background agent it was waiting on died with the process, and
 * 18 hours passed before anyone noticed. Stopping *while* background work runs is
 * normal (completion re-invokes the session). Stopping while **narrating that you
 * are waiting** is the parked state — nobody is watching it, so tell the user.
 *
 * Fires at most once per session (marker file). Never blocks: it emits Stop
 * feedback via additionalContext, so the model can notify and then stop.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

const MARKER_DIR = path.join(process.env.TMPDIR || "/tmp", "standby-watchdog");

const STANDBY =
  /standing by|stand by|waiting (for|on)|awaiting|等(待|它|结果)|等.{0,6}跑完|once (it|the .{1,20}) (finishes|completes|returns)|will (resume|continue) (once|when)/i;

const ADVICE =
  "你正停在「等待中」：还有后台任务在跑，而你这一轮的结尾是在描述等待。" +
  "没有人在看这个会话——后台任务若随进程死掉，它就静默悬空了（真实代价：一次 18 小时）。" +
  "停之前二选一：① 真的要等 → 用阻塞轮询（Monitor / until-loop）把等待放进这一轮；" +
  "② 等不了 → 先 PushNotification 通知用户「已派出 X，结果回来我继续」，再停。" +
  "别只是在文字里说自己在等。";

// ---------------------------------------------------------------------------
// Python-fidelity helpers
// ---------------------------------------------------------------------------

// json.dumps default: ensure_ascii=True — escape everything outside space..tilde
// (with short escapes for the usual control chars), separators (", ", ": ").
function pyStr(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (cp < 0x20 || cp > 0x7e) {
      if (cp > 0xffff) {
        const v = cp - 0x10000;
        out +=
          "\\u" + (0xd800 + (v >> 10)).toString(16).padStart(4, "0") +
          "\\u" + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
        continue;
      }
      out += "\\u" + cp.toString(16).padStart(4, "0");
    } else out += ch;
  }
  return out + '"';
}

function pyDumps(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyStr(v);
  if (Array.isArray(v)) return "[" + v.map((x) => pyDumps(x)).join(", ") + "]";
  return (
    "{" +
    Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => pyStr(k) + ": " + pyDumps(x))
      .join(", ") +
    "}"
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const payload = JSON.parse(readFileSync(0, "utf-8")) as Record<string, unknown>;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
  if (payload.stop_hook_active) return;
  const bt = payload.background_tasks;
  if (!bt || (Array.isArray(bt) && bt.length === 0)) return;
  const lam = payload.last_assistant_message;
  if (!STANDBY.test(typeof lam === "string" ? lam : "")) return;

  const sid = String(payload.session_id || "unknown");
  mkdirSync(MARKER_DIR, { recursive: true });
  const marker = path.join(MARKER_DIR, sid);
  if (existsSync(marker)) return;
  appendFileSync(marker, ""); // Path.touch()

  process.stdout.write(
    pyDumps({
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext: ADVICE,
      },
    }) + "\n",
  );
}

try {
  run();
} catch {
  // fail-open: any exception → silent exit 0
}
process.exit(0);
