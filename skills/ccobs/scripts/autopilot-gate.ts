// Deterministic checks for the nightly autopilot. Nothing here asks a model: every verdict
// comes from an exit code or a hash, run by this process, so an agent's Bash wrappers cannot color it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export type RepoCfg = {
  name: string; path: string; branch: string;
  install?: string;      // runs in the base tree; with cloneDeps its output is copied to later trees, otherwise it runs in each
  prepare?: string;      // runs in every tree after dependencies, e.g. a build the tests import
  cloneDeps?: boolean;   // node_modules only: python venvs hold absolute paths back to the base tree
  listTests: string;     // prints one test file per line
  runTest: string;       // {file} is replaced
  issue?: boolean; deploy?: string; bump?: boolean;
};
export type SpecItem = { id: string; lane: string; reason?: string; acceptance?: string; passes?: boolean; conclusion?: string; decision?: any };
export type Spec = { bundle: string; repo: string; goal: string; allowed_paths: string[]; acceptance_files: string[]; items: SpecItem[] };

export type Sh = { code: number; out: string };
const TAIL = 4000;
export async function sh(cmd: string, cwd: string, timeoutMs = 600_000): Promise<Sh> {
  const p = Bun.spawn(["/bin/zsh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: timeoutMs, killSignal: "SIGKILL" });
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  return { code, out: (o + e).slice(-TAIL) };
}
export function git(cwd: string, ...args: string[]): Sh {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: (r.stdout.toString() + r.stderr.toString()).trim() };
}

// Matched against an item's own words before any agent starts.
const RISK_TEXT = /生产(库|环境|发布|配置|数据)|发生产|上生产|发版|迁移|migration|\bRPC\b|凭证|密钥|api.?key|access.?token|secret|轮换|删除数据|清理数据|清库|drop table|对外发|群发|npm publish|unpublish/i;
// Matched against what a diff touches.
const RISK_PATH = /(^|\/)docs\/migrations\/|\.sql$|(^|\/)\.env|(^|\/)\.npmrc$|(^|\/)(bun\.lockb?|package-lock\.json|uv\.lock|yarn\.lock|pnpm-lock\.yaml)$|skills\/ccobs\/scripts\/|skills\/use-agents\/scripts\/|(^|\/)hooks\//;
const RISK_ADDED = /\b(ALTER|DROP|CREATE)\s+TABLE\b|\bnpm\s+publish\b/i;
const TEST_PATH = /(^|\/)(tests?|__tests__)\/|\.test\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$/;

export const riskyText = (s: string) => s.match(RISK_TEXT)?.[0] ?? null;

export function diffViolations(tree: string, base: string, head: string, spec: Spec): string[] {
  const out: string[] = [];
  const allowed = spec.allowed_paths.map((p) => new Bun.Glob(p));
  for (const line of git(tree, "diff", "--numstat", "--no-renames", `${base}..${head}`).out.split("\n").filter(Boolean)) {
    const [, del, file] = line.split("\t");
    if (!allowed.some((g) => g.match(file))) out.push(`outside allowed_paths: ${file}`);
    if (RISK_PATH.test(file)) out.push(`high-risk path: ${file}`);
    if (TEST_PATH.test(file) && del !== "0" && !spec.acceptance_files.includes(file)) out.push(`removes lines from a test: ${file}`);
  }
  const added = git(tree, "diff", "--no-renames", `${base}..${head}`).out.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const hit = added.find((l) => RISK_ADDED.test(l));
  if (hit) out.push(`high-risk line: ${hit.slice(0, 120)}`);
  return out;
}

export function hashFiles(tree: string, files: string[]): Record<string, string> {
  return Object.fromEntries(files.map((f) => [f, existsSync(join(tree, f)) ? createHash("sha256").update(readFileSync(join(tree, f))).digest("hex") : "missing"]));
}
export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function removeTree(repo: string, dir: string): void {
  git(repo, "worktree", "remove", "--force", dir);
  rmSync(dir, { recursive: true, force: true });
  git(repo, "worktree", "prune");
}

/** Fresh checkout of `at` with dependencies taken from the base tree no agent has touched. */
export async function freshTree(cfg: RepoCfg, base: string, at: string, dir: string): Promise<void> {
  removeTree(cfg.path, dir);
  mkdirSync(dirname(dir), { recursive: true });
  const r = git(cfg.path, "worktree", "add", "-q", "--detach", dir, at);
  if (r.code) throw new Error(`worktree add failed: ${r.out}`);
  if (cfg.cloneDeps) {
    for (const d of git(base, "ls-files", "-oi", "--exclude-standard", "--directory").out.split("\n").filter((l) => /(^|\/)node_modules\/$/.test(l))) {
      const rel = d.replace(/\/$/, "");
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      Bun.spawnSync(["cp", "-cR", join(base, rel), join(dir, rel)]); // APFS clone: instant, and later writes do not reach the base
    }
  } else if (cfg.install) {
    const i = await sh(cfg.install, dir, 900_000);
    if (i.code) throw new Error(`install failed: ${i.out.slice(-400)}`);
  }
  if (cfg.prepare) {
    const p = await sh(cfg.prepare, dir, 900_000);
    if (p.code) throw new Error(`prepare failed: ${p.out.slice(-400)}`);
  }
}

/** Test files that pass, each in its own process: a chained `npm test` stops at the first failure and hides the rest. */
export async function passingTests(tree: string, cfg: RepoCfg, concurrency = 6, fileTimeoutMs = 120_000): Promise<Set<string>> {
  const listed = Bun.spawnSync(["/bin/zsh", "-c", cfg.listTests], { cwd: tree, stdout: "pipe", stderr: "pipe" });
  if (listed.exitCode) throw new Error(`listTests failed: ${listed.stderr.toString().slice(-300)}`);
  const queue = listed.stdout.toString().split("\n").map((f) => f.trim()).filter(Boolean);
  const pass = new Set<string>();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      if ((await sh(cfg.runTest.replaceAll("{file}", f), tree, fileTimeoutMs)).code === 0) pass.add(f);
    }
  }));
  return pass;
}

export type Accept = { id: string; code: number; out: string };
export async function runAcceptance(tree: string, items: SpecItem[], timeoutMs = 300_000): Promise<Accept[]> {
  const out: Accept[] = [];
  for (const i of items) out.push({ id: i.id, ...(await sh(i.acceptance!, tree, timeoutMs)) });
  return out;
}

export type GateResult = { ok: boolean; reasons: string[]; accept: Accept[] };

/** `tree` must be a fresh checkout of `head` that no agent has run in. */
export async function gate(opts: { tree: string; base: string; head: string; spec: Spec; cfg: RepoCfg; acceptanceHash: Record<string, string>; baseline: Set<string> }): Promise<GateResult> {
  const { tree, base, head, spec, cfg, acceptanceHash, baseline } = opts;
  const reasons = diffViolations(tree, base, head, spec);
  const now = hashFiles(tree, spec.acceptance_files);
  for (const f of spec.acceptance_files) if (now[f] !== acceptanceHash[f]) reasons.push(`acceptance file changed: ${f}`);
  const items = spec.items.filter((i) => i.lane === "auto");
  const accept = await runAcceptance(tree, items);
  for (const a of accept) if (a.code !== 0) reasons.push(`acceptance failed: ${a.id} (exit ${a.code})`);
  const pass = await passingTests(tree, cfg);
  for (const f of baseline) if (!pass.has(f)) reasons.push(`was passing, now not: ${f}`);
  return { ok: reasons.length === 0, reasons, accept };
}

