import { expect, test } from "bun:test";
import { scan, verdict } from "./inject-evidence.ts";

const inject = (text: string) => JSON.stringify({ type: "attachment", attachment: { type: "hook_additional_context", content: [text] } });
const say = (text: string, input?: object) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }, ...(input ? [{ type: "tool_use", input }] : [])] } });

test("a hook counts as followed only when a later turn does what it asked", () => {
  const sid = "0c4ab459-2174-443a-be67-072d18000000";
  const got = scan([
    say("【理解】目标：too early, before the injection"),
    inject("<understand-first>…</understand-first>"),
    inject(`<session-precedents>\n[{"session_id":"${sid}"}]\n</session-precedents>`),
    inject("<plan-anchor>\nContext was just compacted.\n</plan-anchor>"),
    inject("<todo-convention>…</todo-convention>"),
    say("【理解】目标：ship it", { command: `rg -n retry /tmp/${sid}.jsonl` }),
  ].join("\n"));
  expect(Object.fromEntries(got)).toEqual({ understand: true, "recall-precedent": true, "session-replay/todo": false });
});

test("verdict", () => {
  expect(verdict(19, 19)).toBe("thin");
  expect(verdict(100, 10)).toBe("keep");
  expect(verdict(100, 9)).toBe("remove");
});
