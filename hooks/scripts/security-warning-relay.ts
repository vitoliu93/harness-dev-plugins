#!/usr/bin/env bun
/**
 * PostToolUse(Agent) hook: never swallow a subagent's SECURITY WARNING.
 *
 * Observed twice in one session: a deploy subagent returned "SECURITY WARNING …
 * no user message naming this production deploy as authorized"; the main context
 * read past it, kept going, and neither closing report mentioned it. The user
 * could not tell a classifier false-positive from a real authorization breach.
 *
 * PostToolUse on the Agent tool (not SubagentStop — that event's output only
 * reaches the subagent itself; injecting into the parent is documented as the
 * Agent-tool PostToolUse path). Limitation: a background spawn returns "launched"
 * here and its warning arrives later in a task notification, out of hook reach —
 * the discipline still applies, this only mechanises the synchronous case.
 */

import { readFileSync } from "node:fs";

const NEEDLE = "SECURITY WARNING";

const ADVICE =
  "刚才的子代理返回里带 SECURITY WARNING。不许跳过：下一条面向用户的消息必须原文引用它的 " +
  "Reason，并明确判断这是分类器误判（说明依据，例如目标是测试环境）还是真实的授权越界；" +
  "判断为真实越界时停下等用户，不要继续下一个动作。收尾汇报里也要留一行。";

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

function flatten(x: unknown): string {
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(flatten).join(" ");
  if (x !== null && typeof x === "object") {
    return Object.values(x as Record<string, unknown>).map(flatten).join(" ");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const payload = JSON.parse(readFileSync(0, "utf-8")) as Record<string, unknown>;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
  if (payload.tool_name !== "Agent" && payload.tool_name !== "Task") return;
  if (!flatten(payload.tool_response).includes(NEEDLE)) return;
  process.stdout.write(
    pyDumps({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
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
