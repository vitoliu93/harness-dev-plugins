/**
 * Self-check for the hooks. Run: bun test
 *
 * Each case pipes a fixture payload into the hook and asserts on stdout.
 * No framework beyond bun:test, no fixtures dir — the smallest thing that
 * fails if the logic breaks. (Port of test_hooks.py.)
 */

import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TIMEOUT = 20_000;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function spawnHook(
  argv: string[],
  input: string,
  env: Record<string, string> = {},
): Promise<RunResult> {
  const proc = Bun.spawn(argv, {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

async function run(
  script: string,
  payload: unknown,
  env: Record<string, string> = {},
): Promise<string> {
  const r = await spawnHook(["bun", join(HERE, script)], JSON.stringify(payload), env);
  expect(r.code, `${script} exited ${r.code}: ${r.stderr}`).toBe(0);
  return r.stdout;
}

async function runBun(
  script: string,
  payload: unknown,
  env: Record<string, string> = {},
): Promise<string> {
  const r = await spawnHook(["bun", "run", join(HERE, script)], JSON.stringify(payload), env);
  expect(r.code, `${script} exited ${r.code}: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
  return r.stdout;
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "hooks-test-"));
}

test("plan-anchor", async () => {
  const d = tmp();
  try {
    const plan = join(d, "docs", "advanced-plans", "2026-07-25-demo");
    mkdirSync(plan, { recursive: true });
    writeFileSync(
      join(plan, "goal.md"),
      "# Goal\n\n## Intent\nnarrative that must NOT be replayed\n\n" +
        "## 参考真源\ndocs/refs/demo/proto.html\n\n" +
        "## Done means\n- the thing works\n\n" +
        "## Explicitly out of scope\n- audio\n",
    );
    writeFileSync(join(plan, "prototype.html"), "<html></html>");
    const arch = join(d, "docs", "advanced-plans", "_archive", "old");
    mkdirSync(arch, { recursive: true });
    writeFileSync(join(arch, "goal.md"), "## Done means\n- archived, must not appear\n");

    const out = await run("plan-anchor.ts", { source: "compact", cwd: d });
    expect(out).toContain("参考真源");
    expect(out).toContain("the thing works");
    expect(out).toContain("audio");
    expect(out).toContain("prototype.html");
    expect(out).not.toContain("narrative that must NOT"); // Intent leaked past the section filter
    expect(out).not.toContain("archived, must not appear"); // _archive not excluded

    expect(await run("plan-anchor.ts", { source: "startup", cwd: d })).toBe(""); // fired on non-compact
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, TIMEOUT);

test("standby-watchdog", async () => {
  const base = {
    session_id: "t-standby",
    background_tasks: [{ id: "b1" }],
    last_assistant_message: "Standing by for the re-render, then continuing.",
  };
  rmSync(join(tmpdir(), "standby-watchdog", base.session_id), { force: true });

  const out = await run("standby-watchdog.ts", base);
  expect(JSON.parse(out).hookSpecificOutput.hookEventName).toBe("Stop");
  expect(await run("standby-watchdog.ts", base)).toBe(""); // fired twice in one session

  const quiet = { ...base, session_id: "t-2", last_assistant_message: "Done, all phases green." };
  expect(await run("standby-watchdog.ts", quiet)).toBe(""); // fired without standby language
  const none = { ...base, session_id: "t-3", background_tasks: [] as unknown[] };
  expect(await run("standby-watchdog.ts", none)).toBe(""); // fired with no background work
  const active = { ...base, session_id: "t-4", stop_hook_active: true };
  expect(await run("standby-watchdog.ts", active)).toBe(""); // ignored stop_hook_active
}, TIMEOUT);

test("security-relay", async () => {
  const hit = {
    tool_name: "Agent",
    tool_response: [{ type: "text", text: "SECURITY WARNING: This subagent performed actions..." }],
  };
  const out = await run("security-warning-relay.ts", hit);
  expect(JSON.parse(out).hookSpecificOutput.hookEventName).toBe("PostToolUse");

  expect(await run("security-warning-relay.ts", { tool_name: "Agent", tool_response: "all good" }))
    .toBe(""); // fired without the needle
  expect(
    await run("security-warning-relay.ts", { tool_name: "Bash", tool_response: "SECURITY WARNING" }),
  ).toBe(""); // fired on a non-Agent tool
}, TIMEOUT);

test("compact-audit", async () => {
  const d = tmp();
  try {
    const obs = join(d, "obs");
    const plan = join(d, "docs", "advanced-plans", "2026-07-25-demo");
    mkdirSync(plan, { recursive: true });
    writeFileSync(
      join(plan, "goal.md"),
      "## 参考真源\ndocs/refs/demo/proto.html · 判定=并排截图\n\n" +
        "## Done means\n- IK3L2X 的控件全部可编辑\n",
    );
    writeFileSync(join(plan, "prototype.html"), "<html></html>");

    const payload = {
      session_id: "t-c",
      cwd: d,
      trigger: "auto",
      compact_summary: "Work continued on prototype.html and IK3L2X.",
    };
    await run("compact-audit.ts", payload, { CCOBS_DIR: obs });
    const row = JSON.parse(readFileSync(join(obs, "compaction.jsonl"), "utf-8").trim());
    const plans = row.plans[0];
    // neither path nor basename in summary
    expect(plans.dropped).toContain("docs/refs/demo/proto.html");
    expect(plans.dropped).toContain("2026-07-25-demo"); // slug absent
    expect(plans.survived).toContain("prototype.html");
    expect(plans.survived).toContain("IK3L2X");
    expect(readFileSync(row.summary_file, "utf-8").startsWith("Work continued")).toBe(true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, TIMEOUT);

test("learn-capture only captures a [LEARN] that starts its line", async () => {
  const d = tmp();
  try {
    const tp = join(d, "t.jsonl");
    const text =
      "说明一下：`[LEARN] x: 这是在讨论约定，不该被抓` 这个通道保持原样。\n" +
      "- [LEARN] project: 行首的才算\n" +
      "[LEARN] feedback: 顶格的也算";
    writeFileSync(tp, JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } }) + "\n");
    await run("learn-capture.ts", { transcript_path: tp, cwd: d, session_id: "abcdef12-0000" });
    const got = readFileSync(join(d, ".claude", "LEARNED.md"), "utf-8");
    expect(got).toContain("[project] 行首的才算");
    expect(got).toContain("[feedback] 顶格的也算");
    expect(got).not.toContain("讨论约定");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, TIMEOUT);
