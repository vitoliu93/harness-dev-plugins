import { expect, test } from "bun:test";
import { detectWall, parseReset } from "./watch";

const now = new Date("2026-09-08T01:00:00"); // local 1am

test("5-hour wall with clock time", () => {
  const w = detectWall("You've hit your session limit · resets 3am (Asia/Shanghai)", now);
  expect(w?.kind).toBe("short");
  expect((w as any).resetAt.getHours()).toBe(3);
});

test("codex try again at", () => {
  const w = detectWall("You've hit your usage limit. Try again at 3:30 PM.", now);
  expect((w as any).resetAt.getHours()).toBe(15);
  expect((w as any).resetAt.getMinutes()).toBe(30);
});

test("pm time already passed rolls to tomorrow", () => {
  const d = parseReset("resets 7pm", new Date("2026-09-08T20:00:00"))!;
  expect(d.getDate()).toBe(9);
});

test("relative duration", () => {
  const d = parseReset("try again in 2 hours 15 minutes", now)!;
  expect(d.getTime() - now.getTime()).toBe(135 * 60_000);
});

test("codex long date", () => {
  const w = detectWall("■ You've hit your usage limit. Upgrade to Pro or try again at Sep 9th, 2026 1:01 AM.", new Date("2026-09-08T20:20:00"));
  expect(w?.kind).toBe("short");
  expect((w as any).resetAt.toISOString()).toBe(new Date("2026-09-09T01:01:00").toISOString());
});

test("reset over a day away counts as weekly", () => {
  expect(detectWall("You've hit your usage limit. try again at Sep 12th, 2026 1:01 AM.", now)?.kind).toBe("weekly");
});

test("weekly wall", () => {
  expect(detectWall("You've hit your weekly limit · resets Sep 11", now)?.kind).toBe("weekly");
  expect(detectWall("You've hit your usage limit. Your weekly limit still applies.", now)?.kind).toBe("weekly");
});

test("no wall", () => {
  expect(detectWall("Reading files... rate limit for API x is 100/min", now)).toBeNull();
});

test("wall text is stable for de-dup", () => {
  const a = detectWall("junk\nYou've hit your usage limit. Try again at 3:30 PM.\n", now)!;
  const b = detectWall("other junk before\nYou've hit your usage limit. Try again at 3:30 PM.\nmore", now)!;
  expect(a.text.startsWith("hit your")).toBe(true);
  expect(a.text.split("\n")[0]).toBe(b.text.split("\n")[0]);
});
