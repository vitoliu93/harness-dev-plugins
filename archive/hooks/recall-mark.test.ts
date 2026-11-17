import { expect, test } from "bun:test";
import { usedIds } from "./recall-mark.ts";

test("a precedent counts as used only when the assistant referred to it in a tool call", () => {
  const a = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const lines = [
    // the injection itself mentions both ids; that is not use
    JSON.stringify({ type: "attachment", attachment: { content: [`- 2026-09-01 ${a} — x\n- 2026-09-02 ${b} — y`] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: `tail -5 ~/.claude/projects/p/${a}.jsonl` } }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: `we could look at ${b}` }] } }),
  ];
  expect(usedIds([a, b], lines)).toEqual([a]);
});
