import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractJson, piCall, resolveModel } from "./pi-call.ts";

const DIR = mkdtempSync(join(tmpdir(), "pi-call-test-"));
const SAVED = process.env.CCOBS_DIR;

beforeAll(() => {
  process.env.CCOBS_DIR = DIR;
  writeFileSync(
    join(DIR, "llm.json"),
    JSON.stringify({ default: "prov/base:low", distill: "prov/distill" }),
  );
});
afterAll(() => {
  if (SAVED === undefined) delete process.env.CCOBS_DIR;
  else process.env.CCOBS_DIR = SAVED;
  rmSync(DIR, { recursive: true, force: true });
});

test("resolveModel: named scenario wins, unknown falls back to default", () => {
  expect(resolveModel("distill")).toBe("prov/distill");
  expect(resolveModel("nobody-configured-this")).toBe("prov/base:low");
});

test("resolveModel: allowDefault=false needs its own key", () => {
  // An image handed to a text-only default model is worse than no vision.
  expect(resolveModel("vision", false)).toBeNull();
  expect(resolveModel("distill", false)).toBe("prov/distill");
});

test("extractJson digs the object out of fences and prose", () => {
  expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(extractJson('好的，结果是：{"a":1}。完毕')).toEqual({ a: 1 });
  expect(() => extractJson("no object here")).toThrow();
});

test("piCall: an oversized prompt is refused before spawn", async () => {
  // Over ARG_MAX, Bun.spawn throws E2BIG and the caller fails open silently.
  // The point of the guard is the stderr line, so this must not reach pi.
  const t0 = Date.now();
  expect(await piCall("x".repeat(1_000_000), { model: "prov/never-called" })).toBeNull();
  expect(Date.now() - t0).toBeLessThan(1000); // no process was started
});

// Last on purpose: it removes the config the tests above rely on.
test("resolveModel: no llm.json means null, never a built-in model", () => {
  unlinkSync(join(DIR, "llm.json"));
  expect(resolveModel("distill")).toBeNull();
});

test("piCall: tools stay off unless the caller asks", async () => {
  // The hermetic flags are what keep a cron-run model from touching the box.
  // Only distill's big-file branch opts out, so a regression here is silent
  // privilege creep — assert on the argv pi would actually get.
  const seen: string[][] = [];
  const realSpawn = Bun.spawn;
  // @ts-expect-error test double
  Bun.spawn = (argv: string[]) => { seen.push(argv); throw new Error("no launch"); };
  try {
    await piCall("hi", { model: "prov/m" });
    await piCall("hi", { model: "prov/m", tools: true });
  } finally { Bun.spawn = realSpawn; }
  expect(seen).toHaveLength(2);
  expect(seen[0]).toContain("--no-tools");
  expect(seen[1]).not.toContain("--no-tools");
  // the rest of the seal holds either way
  for (const argv of seen) expect(argv).toContain("--no-context-files");
});
