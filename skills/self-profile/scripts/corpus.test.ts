import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const now = new Date().toISOString();
const user = (text: string, extra: object = {}) => JSON.stringify({ type: "user", timestamp: now, sessionId: "aaaaaaaa-1", entrypoint: "cli", permissionMode: "auto", origin: { kind: "human" }, message: { content: text }, ...extra });
const assistant = (text: string) => JSON.stringify({ type: "assistant", timestamp: now, message: { content: [{ type: "text", text }] } });

test("keeps typed messages, masks tokens, drops worker sessions and duplicates", () => {
  const cfg = mkdtempSync(join(tmpdir(), "self-profile-")), out = join(cfg, "out");
  mkdirSync(join(cfg, "projects/demo"), { recursive: true });
  mkdirSync(join(cfg, "projects/demo-fork"), { recursive: true });
  const typed = [
    assistant("Done. Shall I push?"),
    user("push it, and stop asking"),
    user("my key is sk-abcdefghijklmnopqrstuvwxyz012345"),
    JSON.stringify({ type: "user", timestamp: now, message: { content: [{ type: "tool_result", content: "noise" }] } }),
    user("[Request interrupted by user]"),
    user("<task-notification>agent finished</task-notification>", { origin: { kind: "task-notification" } }),
  ].join("\n");
  writeFileSync(join(cfg, "projects/demo/a.jsonl"), typed);
  writeFileSync(join(cfg, "projects/demo-fork/b.jsonl"), typed); // a forked session repeats the same lines
  writeFileSync(join(cfg, "projects/demo/worker.jsonl"), [user("Read /tmp/cards/card-1.md and do it."), user("looks fine")].join("\n"));
  writeFileSync(join(cfg, "history.jsonl"), JSON.stringify({ display: "push it, and stop asking", timestamp: Date.now(), project: "/tmp/demo" }));

  const r = Bun.spawnSync(["bun", join(import.meta.dir, "corpus.ts"), "--out", out], { env: { ...process.env, CLAUDE_CONFIG_DIR: cfg, CCOBS_DIR: join(cfg, "none") } });
  expect(r.exitCode).toBe(0);
  const summary = JSON.parse(r.stdout.toString());
  const slice = readdirSync(join(summary.run, "slice-1")).map(f => readFileSync(join(summary.run, "slice-1", f), "utf8")).join("\n");
  const stats = JSON.parse(readFileSync(join(summary.run, "stats.json"), "utf8"));

  expect(slice).toContain("push it, and stop asking");
  expect(slice).toContain("↳assistant ended with: Done. Shall I push?");
  expect(slice).toContain("[masked]");
  expect(slice).not.toContain("abcdefghijklmnop");
  expect(slice).not.toContain("card-1.md");
  expect(slice).not.toContain("noise");
  expect(stats.messages).toBe(2);
  expect(stats.interrupts).toBe(1);
  expect(stats.workerSessions).toBe(1);
  expect(stats.ledger).toBeNull();
  expect(stats.monthlyTerminalInput[0].messages).toBe(1);
});
