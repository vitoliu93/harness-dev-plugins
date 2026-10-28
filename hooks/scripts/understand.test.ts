import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldFire } from "./understand.ts";

test("fires on a vague user task, not on acks, slash commands or task cards", () => {
  expect(shouldFire("修一下上传失败的问题")).toBe(true);
  for (const p of ["继续", "ok", "可以。", "/ship IKAB12", "!ls", "按 /tmp/x/card.md 执行，最后一行 DONE", "你是独立审核，只读不改"]) expect(shouldFire(p)).toBe(false);
});

test("injects once per session", async () => {
  const env = { ...process.env, CCOBS_DIR: mkdtempSync(join(tmpdir(), "und-")) };
  const run = async () => {
    const p = Bun.spawn(["bun", join(import.meta.dir, "understand.ts")], { stdin: new Blob([JSON.stringify({ session_id: "s1", prompt: "把素材库上传改成支持断点续传", cwd: "/x" })]), stdout: "pipe", env });
    return new Response(p.stdout).text();
  };
  expect(JSON.parse(await run()).hookSpecificOutput.additionalContext).toContain("【理解】目标");
  expect(await run()).toBe("");
});
