import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTaskCard, shouldFire } from "./understand.ts";

// Shapes taken from real dispatched sessions; distill labels these [任务卡] instead of [用户].
test("a session's opening prompt is told apart from a card", () => {
  expect(isTaskCard('<pasted_content id="6033">\nrole: assistant\ngoal: 改飞书文档第 1 节\nwrites: 只改这一篇\noutput: /tmp/x/docedit.md。回复只给路径。')).toBe(true);
  expect(isTaskCard("role: reviewer-api\nbaseline: 3f2a1c9\nresult_file: /tmp/x/review.md")).toBe(true);
  expect(isTaskCard("# Waitness 任务卡 70f74a\n你是请假期间的代理")).toBe(true);
  expect(isTaskCard("This session is being continued from a previous conversation. Summary: 设计稿经多轮独立审核才可定稿")).toBe(false);
  expect(isTaskCard("上传失败了，帮我看看 role: admin 的账号为什么不行")).toBe(false);
});

test("fires on a vague user task, not on acks, slash commands or task cards", () => {
  expect(shouldFire("修一下上传失败的问题")).toBe(true);
  for (const p of ["继续", "ok", "可以。", "/ship IKAB12", "!ls", "按 /tmp/x/card.md 执行，最后一行 DONE", "你是独立审核，只读不改"]) expect(shouldFire(p)).toBe(false);
  for (const p of ["把 docs/plan.md 里的 TODO 都标成 DONE", "看一下 /tmp/notes.md 里我记的想法，然后开始做"]) expect(shouldFire(p)).toBe(true);
});

const fire = async (env: Record<string, string | undefined>, extra: Record<string, string> = {}) => {
  const p = Bun.spawn(["bun", join(import.meta.dir, "understand.ts")], { stdin: new Blob([JSON.stringify({ session_id: "s1", prompt: "把素材库上传改成支持断点续传", cwd: "/x", ...extra })]), stdout: "pipe", env });
  return new Response(p.stdout).text();
};

test("without a transcript it injects once per session", async () => {
  const env = { ...process.env, CCOBS_DIR: mkdtempSync(join(tmpdir(), "und-")) };
  expect(JSON.parse(await fire(env)).hookSpecificOutput.additionalContext).toContain("【理解】目标");
  expect(await fire(env)).toBe("");
});

test("with a transcript it repeats until the lines are written, at most 3 times", async () => {
  const dir = mkdtempSync(join(tmpdir(), "und-"));
  const env = { ...process.env, CCOBS_DIR: dir };
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, "{}\n");
  expect(await fire(env, { transcript_path: transcript })).not.toBe("");
  expect(await fire(env, { transcript_path: transcript })).not.toBe("");
  writeFileSync(transcript, JSON.stringify({ text: "【理解】目标：断点续传" }) + "\n");
  expect(await fire(env, { transcript_path: transcript })).toBe("");
});

test("a dispatched agent never gets the protocol", async () => {
  const env = { ...process.env, CCOBS_DIR: mkdtempSync(join(tmpdir(), "und-")), DEVKIT_DELEGATED: "1" };
  expect(await fire(env)).toBe("");
});
