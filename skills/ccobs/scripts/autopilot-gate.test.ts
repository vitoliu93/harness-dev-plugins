import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RepoCfg, type Spec, validateSpec, diffViolations, freshTree, gate, git, hashFiles, passingTests, riskyText } from "./autopilot-gate.ts";
import { expandChain, isAccessError, isQuotaError, quotaBlocked } from "./autopilot-route.ts";

function repo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ap-")));
  const dir = join(root, "r");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "src/a.ts"), "export const a = () => 1;\n");
  writeFileSync(join(dir, "test/a.test.ts"), `import {a} from "../src/a.ts"; import {test,expect} from "bun:test"; test("a",()=>{expect(a()).toBeGreaterThan(0)});\n`);
  writeFileSync(join(dir, "test/old.test.ts"), `import {test,expect} from "bun:test"; test("bad",()=>{expect(1).toBe(2)});\n`);
  git(dir, "init", "-q");
  const commit = (m: string) => { git(dir, "add", "."); git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", m); return git(dir, "rev-parse", "HEAD").out; };
  const base = commit("init");
  const cfg: RepoCfg = { name: "r", path: dir, branch: "main", listTests: "git ls-files 'test/*.test.ts'", runTest: "bun test ./{file}" };
  return { root, dir, base, commit, cfg };
}
const spec = (over: Partial<Spec> = {}): Spec => ({ bundle: "b", repo: "r", goal: "g", allowed_paths: ["src/**"], acceptance_files: ["test/new.test.ts"], items: [{ id: "t-1", lane: "auto", acceptance: "bun test ./test/new.test.ts" }], ...over });

test("baseline: a file that already fails does not count, one file per process", async () => {
  const { dir, cfg } = repo();
  expect([...await passingTests(dir, cfg)]).toEqual(["test/a.test.ts"]);
});

test("diff checks: path scope, risky paths, removed test lines, DDL", () => {
  const { dir, base, commit } = repo();
  writeFileSync(join(dir, "README.md"), "x"); writeFileSync(join(dir, "src/x.sql"), "select 1"); writeFileSync(join(dir, "test/a.test.ts"), "//\n");
  writeFileSync(join(dir, "src/a.ts"), "// ALTER TABLE t ADD c int\n");
  const v = diffViolations(dir, base, commit("x"), spec());
  expect(v.some((s) => s.includes("outside allowed_paths: README.md"))).toBe(true);
  expect(v.some((s) => s.includes("high-risk path: src/x.sql"))).toBe(true);
  expect(v.some((s) => s.includes("removes lines from a test: test/a.test.ts"))).toBe(true);
  expect(v.some((s) => s.includes("high-risk line"))).toBe(true);
});

test("gate: passes a real fix, fails a broken baseline test or a touched acceptance file", async () => {
  const { root, dir, commit, cfg } = repo();
  writeFileSync(join(dir, "test/new.test.ts"), `import {a} from "../src/a.ts"; import {test,expect} from "bun:test"; test("n",()=>{expect(a()).toBe(2)});\n`);
  const base = commit("acceptance");
  const acceptanceHash = hashFiles(dir, ["test/new.test.ts"]);
  const baseline = new Set(["test/a.test.ts"]);
  const check = async (head: string, name: string) => { const tree = join(root, name); await freshTree(cfg, dir, head, tree); return gate({ tree, base, head, spec: spec(), cfg, acceptanceHash, baseline }); };

  writeFileSync(join(dir, "src/a.ts"), "export const a = () => 2;\n");
  expect((await check(commit("fix"), "g1"))).toMatchObject({ ok: true, reasons: [] });

  writeFileSync(join(dir, "src/a.ts"), "export const a = () => 0;\n");
  const bad = await check(commit("regress"), "g2");
  expect(bad.ok).toBe(false);
  expect(bad.reasons).toContain("was passing, now not: test/a.test.ts");

  writeFileSync(join(dir, "src/a.ts"), "export const a = () => 2;\n");
  writeFileSync(join(dir, "test/new.test.ts"), `import {test} from "bun:test"; test("n",()=>{});\n`);
  const cheat = await check(commit("cheat"), "g3");
  expect(cheat.reasons).toContain("acceptance file changed: test/new.test.ts");
}, 30_000);

test("risky words catch real items and leave product terms alone", () => {
  expect(riskyText("补生产库设备码依赖表迁移")).not.toBeNull();
  expect(riskyText("轮换已入聊天记录的部署凭证")).not.toBeNull();
  expect(riskyText("看生产矩阵时报错")).toBeNull();
  expect(riskyText("读取错误提示重复显示")).toBeNull();
});

test("model chain: alias routes first, limited and skipped ones out, then the next alias", () => {
  const agents = { agents: {
    gemini: { effort: "high", routes: [{ id: "g1", kind: "pi", model: "m1", use: "normal" }, { id: "g2", kind: "pi", model: "m2", use: "normal" }] },
    deepseek: { effort: "max", routes: [{ id: "d2", kind: "pi", model: "o", use: "fallback" }, { id: "d1", kind: "pi", model: "d", use: "normal" }] },
    sonnet: { routes: [{ id: "s", kind: "claude", model: "sonnet", use: "normal" }] },
  } };
  const now = Date.parse("2026-11-09T12:00:00Z");
  const quota = { routes: { g2: { limited_at: "2026-11-09T11:00:00Z", reset_at: null } } };
  const ids = (skip: string[]) => expandChain([{ alias: "gemini" }, { alias: "deepseek" }, { alias: "sonnet" }], agents, quota, new Set(skip), now).map((r) => r.id);
  expect(ids([])).toEqual(["g1", "d1", "d2", "s"]);
  expect(ids(["g1", "d1", "d2"])).toEqual(["s"]);
  const [r] = expandChain([{ alias: "sonnet", effort: "medium" }], agents, quota, new Set(), now);
  expect(r.effort).toBe("medium");
});

test("a wall with no stated reset gets probed again after a while; a stated reset is honored", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  expect(quotaBlocked({ limited_at: "2026-11-09T11:00:00Z", reset_at: null }, now)).toBe(true);
  expect(quotaBlocked({ limited_at: "2026-09-21T10:52:00Z", reset_at: null }, now)).toBe(false);
  expect(quotaBlocked({ limited_at: "2026-11-09T11:00:00Z", reset_at: "2026-11-10T00:00:00Z" }, now)).toBe(true);
});

test("access errors switch models; ordinary failures do not", () => {
  expect(isAccessError('{"error":{"code":402,"message":"Your prepayment credits are depleted."}}')).toBe(true);
  expect(isAccessError("401 Unauthorized")).toBe(true);
  expect(isAccessError("You've hit your usage limit")).toBe(true);
  expect(isQuotaError("401 Unauthorized")).toBe(false);
  expect(isQuotaError("insufficient_balance")).toBe(true);
  expect(isAccessError("expect(received).toBe(expected)")).toBe(false);
});

test("spec: acceptance files must be new test files, commands must run them and stay local", () => {
  const { dir } = repo();
  writeFileSync(join(dir, "test/new.test.ts"), "x"); writeFileSync(join(dir, ".env"), "x");
  const known = new Set(["t-1"]);
  const v = (over: any, cmd = "bun test ./test/new.test.ts") => validateSpec({ ...spec({ items: [{ id: "t-1", lane: "auto", acceptance: cmd }] }), ...over }, known, dir);
  expect(v({})).toBeNull();
  expect(v({ acceptance_files: [".env"] }, "bun test .env")).toContain("not allowed");
  expect(v({ acceptance_files: ["src/a.ts"] }, "bun src/a.ts")).toContain("not a test file");
  expect(v({ acceptance_files: ["test/a.test.ts"] }, "bun test test/a.test.ts")).toContain("already exists");
  expect(v({}, "bun test ./test/new.test.ts && git push origin HEAD:dev")).toContain("not allowed");
  expect(v({}, "true")).toContain("does not run");
  writeFileSync(join(dir, "test/b.test.ts"), "x");
  expect(v({ acceptance_files: ["test/new.test.ts", "test/b.test.ts"] })).toContain("never run");
  symlinkSync("/etc/hosts", join(dir, "test/link.test.ts"));
  expect(v({ acceptance_files: ["test/link.test.ts"] }, "bun test ./test/link.test.ts")).toContain("symlink");
});
