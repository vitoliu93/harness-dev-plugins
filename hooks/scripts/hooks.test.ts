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

    // with a transcript, only plans the session mentioned are replayed
    const other = join(d, "docs", "advanced-plans", "2026-07-26-other");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "goal.md"), "## Done means\n- other plan, never opened here\n");
    const tp = join(d, "t.jsonl");
    writeFileSync(tp, JSON.stringify({ type: "user", message: { content: "看 2026-07-25-demo 的 goal" } }) + "\n");
    const only = await run("plan-anchor.ts", { source: "compact", cwd: d, transcript_path: tp });
    expect(only).toContain("the thing works");
    expect(only).not.toContain("never opened here"); // newest-mtime plan not from this session leaked
    writeFileSync(tp, JSON.stringify({ type: "user", message: { content: "unrelated" } }) + "\n");
    expect(await run("plan-anchor.ts", { source: "compact", cwd: d, transcript_path: tp })).toBe(""); // no mention → silent
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, TIMEOUT);

test("session-replay: a dispatched agent gets no [LEARN] or todo convention", async () => {
  const d = mkdtempSync(join(tmpdir(), "replay-"));
  try {
    const env = { CCOBS_DIR: d, DEVKIT_DELEGATED: "" };
    const mine = await run("session-replay.ts", { cwd: d, source: "startup" }, env);
    expect(mine).toContain("<learn-convention>");
    const theirs = await run("session-replay.ts", { cwd: d, source: "startup" }, { ...env, DEVKIT_DELEGATED: "1" });
    expect(theirs).not.toContain("<learn-convention>");
    expect(theirs).not.toContain("<todo-convention>");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
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

    // transcript given: a plan the session never mentioned is not audited
    const tp = join(d, "t.jsonl");
    writeFileSync(tp, JSON.stringify({ type: "user", message: { content: "unrelated" } }) + "\n");
    await run("compact-audit.ts", { ...payload, transcript_path: tp }, { CCOBS_DIR: obs });
    const rows = readFileSync(join(obs, "compaction.jsonl"), "utf-8").trim().split("\n");
    expect(JSON.parse(rows[rows.length - 1]).plans).toEqual([]);
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

test("plan-split: once per user turn, after 3+ other tool calls, 3+ plan items or no plan, never for dispatched agents", async () => {
  const obs = mkdtempSync(join(tmpdir(), "split-"));
  const tp = join(obs, "t.jsonl");
  const line = (o: unknown) => JSON.stringify(o) + "\n";
  const prompt = (uuid: string, text: string) => line({ type: "user", userType: "external", uuid, message: { role: "user", content: text } });
  const use = (name: string, input: unknown = {}) => line({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
  const items = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ content: `step ${i}` })) });
  const call = (tool_input: unknown, tool_name = "mcp__ccd_turn__update_plan", session_id = "s1") => ({ session_id, transcript_path: tp, tool_name, tool_input });
  const env = { CCOBS_DIR: obs };
  try {
    writeFileSync(tp, prompt("u1", "修三张单") + line({ type: "user", userType: "external", uuid: "h", message: { content: "<system-reminder>x</system-reminder>" } }) + use("mcp__ccd_turn__update_plan", items(4)));
    expect(await run("plan-split.ts", call(items(4)), env)).toBe(""); // first plan write: nothing read yet
    writeFileSync(tp, readFileSync(tp, "utf8") + use("Read") + use("Grep") + use("Bash"));
    const out = JSON.parse(await run("plan-split.ts", call({ advance: true }), env)); // first advance after reading
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.additionalContext).toContain("计划有 4 项");
    expect(await run("plan-split.ts", call({ advance: true }), env)).toBe(""); // once per turn
    writeFileSync(tp, readFileSync(tp, "utf8") + prompt("u2", "改个错字") + use("mcp__ccd_turn__update_plan", items(2)) + use("Read") + use("Edit") + use("Bash"));
    expect(await run("plan-split.ts", call({ advance: true }), env)).toBe(""); // 2 items: too small
    expect(await run("plan-split.ts", call({ advance: true }), { ...env, DEVKIT_DELEGATED: "1" })).toBe("");
    expect(await run("plan-split.ts", call({}, "Read"), env)).toBe(""); // planned turn: a look tool waits for the plan
    expect(await run("plan-split.ts", call({}, "Edit"), env)).toBe(""); // neither plan nor look tool
    // CLI: TaskCreate one task each, TaskUpdate after reading
    writeFileSync(tp, readFileSync(tp, "utf8") + prompt("u3", "三个仓库升级 Node") + use("TaskCreate") + use("TaskCreate") + use("TaskCreate") + use("Read") + use("Grep") + use("Read"));
    expect(await run("plan-split.ts", call({ taskId: "1", status: "completed" }, "TaskUpdate"), env)).toContain("计划有 3 项");
    // no plan tools (newer models): fires on a look tool after 3 looks, without the item count
    writeFileSync(tp, readFileSync(tp, "utf8") + prompt("u4", "两个仓库各修一个 bug") + use("Read") + use("Grep"));
    expect(await run("plan-split.ts", call({}, "Read"), env)).toBe(""); // 2 looks
    writeFileSync(tp, readFileSync(tp, "utf8") + use("Bash"));
    const np = await run("plan-split.ts", call({}, "Bash"), env);
    expect(np).toContain("拆分：");
    expect(np).not.toContain("计划有");
    expect(np).toContain("交付物");
    expect(await run("plan-split.ts", call({}, "Grep"), env)).toBe(""); // once per turn
  } finally { rmSync(obs, { recursive: true, force: true }); }
}, TIMEOUT);

test("skill-path-fallback: deny bare placeholder, allow single-quoted and quoted-heredoc bodies", async () => {
  const run = (command: string) =>
    spawnHook(["bash", join(HERE, "skill-path-fallback.sh")], JSON.stringify({ tool_input: { command } }));
  const P = "${CLAUDE_PLUGIN_ROOT}";
  const denied = async (c: string) => (await run(c)).stdout.includes('"deny"');
  expect(await denied(`bun ${P}/x.ts`)).toBe(true);
  expect(await denied(`bun "${P}/x.ts"`)).toBe(true);
  expect(await denied(`cat <<EOF\n${P}\nEOF`)).toBe(true); // unquoted heredoc expands
  expect(await denied(`git commit -m '${P}'`)).toBe(false);
  expect(await denied(`python3 - <<'EOF'\nd = {"c": "\\"${P}\\""}\nEOF`)).toBe(false);
  expect(await denied(`cat <<"X" > f\n${P}\nX\necho ok`)).toBe(false);
  expect(await denied(`cat <<-\\X\n\t${P}\n\tX\nbun ${P}/y.ts`)).toBe(true); // body stripped, line after it still checked
}, TIMEOUT);
