/**
 * Tests for skill-atlas-guard.sh (PreToolUse Bash gate on git commit).
 * Port of test_skill_atlas_guard.py — bash hook driven via Bun.spawn against a
 * temporary git-repo fixture.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "skill-atlas-guard.sh");
const TIMEOUT = 20_000;

let dir: string;
let root: string;
let skill: string;
let atlas: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-guard-"));
  root = dir;
  const init = Bun.spawnSync(["git", "init", "-q", root]);
  if (init.exitCode !== 0) throw new Error(`git init failed: ${init.stderr}`);
  const manifest = join(root, ".claude-plugin", "plugin.json");
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(manifest, '{"name":"dev-kit"}\n');
  skill = join(root, "skills", "demo", "SKILL.md");
  mkdirSync(dirname(skill), { recursive: true });
  writeFileSync(
    skill,
    "---\nname: demo\ndescription: >-\n  Run a demo.\n  Use when a demo is needed.\n---\n",
  );
  atlas = join(root, "atlas-state");
  mkdirSync(join(atlas, "atlas"), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeAtlas(styleCount: number, fresh = true): void {
  const route = join(atlas, "atlas", "route_overlap_matrix.csv");
  writeFileSync(route, "skill_a,skill_b\n");
  const report = join(atlas, "skill_atlas.json");
  writeFileSync(
    report,
    JSON.stringify({
      summary: { style_issue_count: styleCount, actionable_style_issue_count: 0 },
    }),
  );
  const stamp = Date.now() / 1000 + (fresh ? 5 : -5);
  utimesSync(route, stamp, stamp);
  utimesSync(report, stamp, stamp);
}

async function runGuard(): Promise<string> {
  const payload = JSON.stringify({ cwd: root, tool_input: { command: "git commit -m test" } });
  const proc = Bun.spawn(["bash", HOOK], {
    stdin: new Blob([payload]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, SKILL_ATLAS_DIR: atlas },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  expect(code, `hook exited ${code}: ${stderr}`).toBe(0);
  return stdout;
}

test("allows fresh clean atlas", async () => {
  writeAtlas(0);
  expect(await runGuard()).toBe("");
}, TIMEOUT);

test("denies fresh atlas with style findings", async () => {
  writeAtlas(2);
  const output = await runGuard();
  expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(output).toContain("Skill & Doc Style");
  // deny message points at the TypeScript atlas builder (py→ts migration)
  expect(output).toContain("bun ");
  expect(output).toContain("build_skill_atlas.ts");
  expect(output).not.toContain("build_skill_atlas.py");
}, TIMEOUT);

test("root markdown and orphan scripts trigger gate", async () => {
  rmSync(skill);
  writeFileSync(join(root, "skills", "demo", "call-site.md"), "runtime guidance\n");
  const orphan = join(root, "skills", "orphan", "scripts");
  mkdirSync(orphan, { recursive: true });
  writeFileSync(join(orphan, "run.sh"), "echo ok\n");
  writeAtlas(2);
  const output = await runGuard();
  expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe("deny");
}, TIMEOUT);

test("denies stale atlas", async () => {
  writeAtlas(0, false);
  const output = await runGuard();
  expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe("deny");
}, TIMEOUT);

test("ignores non-runtime changes", async () => {
  rmSync(skill);
  writeFileSync(join(root, "README.md"), "docs\n");
  expect(await runGuard()).toBe("");
}, TIMEOUT);
