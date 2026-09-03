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
    env: { ...process.env, PROMPT_FORGE: "1", ...env },
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

test("prompt-forge-disabled", async () => {
  // PROMPT_FORGE=0 disables the hook.
  expect(await runBun("prompt-forge.ts", { prompt: "whatever" }, { PROMPT_FORGE: "0" })).toBe("");
}, TIMEOUT);

test("prompt-forge-gate1", async () => {
  // Gate 1: short inputs and confirmation words pass through silently.
  // Enabled by default — no env flag needed
  expect(await runBun("prompt-forge.ts", { prompt: "ok" })).toBe("");
  expect(await runBun("prompt-forge.ts", { prompt: "跑一下测试" })).toBe("");
  expect(await runBun("prompt-forge.ts", { prompt: "  好  " })).toBe("");
  expect(await runBun("prompt-forge.ts", { prompt: "go ahead" })).toBe("");
  expect(await runBun("prompt-forge.ts", { prompt: "got it" })).toBe("");
  // A pasted image is unreachable at hook time — the prompt points at pixels
  // the classifier cannot see, so it passes through.
  expect(
    await runBun("prompt-forge.ts", { prompt: "[Image #2] 这个位置对吗，帮我调整一下布局" }),
  ).toBe("");
  // Long non-confirmation with mock pass → silent
  expect(
    await runBun(
      "prompt-forge.ts",
      { prompt: "this is a long and somewhat vague request to fix things" },
      { PROMPT_FORGE_TEST_MOCK: '{"verdict":"pass"}' },
    ),
  ).toBe("");
}, TIMEOUT);

test("prompt-forge-gate2", async () => {
  // Gate 2: LLM classification with mock responses.
  const longPrompt = "make the authentication system more robust and fix all the issues";

  // Mock: verdict pass → silent
  expect(
    await runBun("prompt-forge.ts", { prompt: longPrompt }, { PROMPT_FORGE_TEST_MOCK: '{"verdict":"pass"}' }),
  ).toBe("");

  // Mock: verdict rewrite with no path claims → injects additionalContext
  const out = await runBun(
    "prompt-forge.ts",
    { prompt: longPrompt },
    {
      PROMPT_FORGE_TEST_MOCK:
        '{"verdict":"rewrite","enriched":"Harden the authentication flow: enumerate its failure paths, fix each, and confirm the suite passes."}',
    },
  );
  const result = JSON.parse(out);
  expect(result.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  const ctx = result.hookSpecificOutput.additionalContext;
  expect(ctx).toBe(
    "Harden the authentication flow: enumerate its failure paths, fix each, and confirm the suite passes.",
  );

  // Mock: rewrite citing a path found nowhere in prompt or transcript →
  // discarded, prompt passes through unchanged.
  expect(
    await runBun(
      "prompt-forge.ts",
      { prompt: longPrompt },
      { PROMPT_FORGE_TEST_MOCK: '{"verdict":"rewrite","enriched":"Fix auth in src/login.ts"}' },
    ),
  ).toBe("");

  // A prompt that names a path never reaches gate 2 (gate 1 anchors on it), so
  // the transcript is the only corpus that can source one — covered below.

  // Mock: invalid JSON → fail-open silently
  expect(
    await runBun("prompt-forge.ts", { prompt: longPrompt }, { PROMPT_FORGE_TEST_MOCK: "not json" }),
  ).toBe("");

  // Empty prompt → silent
  expect(await runBun("prompt-forge.ts", { prompt: "" })).toBe("");

  // Invalid stdin → silent
  const bad = await spawnHook(["bun", "run", join(HERE, "prompt-forge.ts")], "not valid json");
  expect(bad.code).toBe(0);
  expect(bad.stdout).toBe("");
}, TIMEOUT);

test("prompt-forge-logging", async () => {
  // Progress logs go to stderr only; stdout stays pure hook JSON.
  const runCase = (prompt: string, mock?: string) =>
    spawnHook(
      ["bun", "run", join(HERE, "prompt-forge.ts")],
      JSON.stringify({ prompt }),
      mock ? { PROMPT_FORGE_TEST_MOCK: mock } : {},
    );

  // Gate 1 reasons are distinguishable in the log
  expect((await runCase("ok")).stderr).toContain("confirmation word");
  expect((await runCase("跑一下测试")).stderr).toContain("short input");
  // Interior whitespace does not count toward the threshold
  expect((await runCase("跑 一下 测试")).stderr).toContain("short input (5");
  // 7 codepoints clears the threshold — a fuzzy Chinese sentence must reach gate 2
  expect((await runCase("把那个配置清理一下", '{"verdict":"pass"}')).stderr).toContain("gate2");
  // Mock as a safety net: if gate 1 regresses these must not hit the real API
  expect(
    (await runCase("/code-review the entire branch with high effort please", '{"verdict":"pass"}')).stderr,
  ).toContain("slash command");
  expect(
    (await runCase("refactor the retry helper in src/auth/login.ts to return Result", '{"verdict":"pass"}')).stderr,
  ).toContain("specific anchor");
  expect(
    (await runCase("把 handleSubmit() 的错误处理改成统一的模式然后跑一遍测试", '{"verdict":"pass"}')).stderr,
  ).toContain("specific anchor");

  const longPrompt = "make the authentication system more robust and fix all the issues";
  const okRes = await runCase(longPrompt, '{"verdict":"pass"}');
  expect(okRes.stderr).toContain("gate2: classifying");
  expect(okRes.stderr).toContain("verdict=pass");
  expect(okRes.stdout).toBe(""); // stdout must stay empty on pass

  const rw = await runCase(longPrompt, '{"verdict":"rewrite","enriched":"Harden the auth flow end to end."}');
  expect(rw.stderr).toContain("verdict=rewrite");
  expect(rw.stderr).toContain("injecting additionalContext");
  expect(JSON.parse(rw.stdout).hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");

  const unsourced = await runCase(longPrompt, '{"verdict":"rewrite","enriched":"Fix auth in src/login.ts"}');
  expect(unsourced.stderr).toContain("unsourced paths");
  expect(unsourced.stdout).toBe("");

  const bad = await runCase(longPrompt, "not json");
  expect(bad.stderr).toContain("pi call failed");
  expect(bad.stderr).toContain("fail-open");
  expect(bad.stdout).toBe(""); // fail-open must not emit stdout

  const disabled = await spawnHook(
    ["bun", "run", join(HERE, "prompt-forge.ts")],
    JSON.stringify({ prompt: longPrompt }),
    { PROMPT_FORGE: "0" },
  );
  expect(disabled.stderr).toContain("disabled");
  expect(disabled.stdout).toBe("");
}, TIMEOUT);

test("prompt-forge-path-provenance", async () => {
  // A path the transcript actually mentions is sourced and survives; git
  // signals are deliberately not part of the corpus.
  const d = tmp();
  try {
    const tp = join(d, "t.jsonl");
    writeFileSync(
      tp,
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "the retry lives in src/login.ts" }] },
      }),
    );
    const run = (enriched: string) =>
      runBun(
        "prompt-forge.ts",
        {
          prompt: "make the authentication system more robust and fix all the issues",
          transcript_path: tp,
        },
        { PROMPT_FORGE_TEST_MOCK: JSON.stringify({ verdict: "rewrite", enriched }) },
      );

    const kept = await run("Fix the retry in src/login.ts");
    expect(JSON.parse(kept).hookSpecificOutput.additionalContext).toContain("src/login.ts");

    expect(await run("Fix the retry in src/session.ts")).toBe("");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, TIMEOUT);

test("prompt-forge-vision-routing", async () => {
  // An image from a recent turn is readable and routes the classifier to the
  // model under llm.json's "vision" key. No such key means no vision routing —
  // this scenario deliberately does NOT fall back to "default", because a
  // text-only model handed an image is worse than no vision at all.
  const d = tmp();
  try {
    const tp = join(d, "t.jsonl");
    writeFileSync(
      tp,
      [
        JSON.stringify({
          type: "user",
          message: {
            content: [
              { type: "text", text: "[Image #1] 看下这个页面" },
              { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
            ],
          },
        }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "看到了。" }] } }),
        // A real work loop between the image and the follow-up: dozens of
        // tool_use/tool_result entries. The window counts user turns, so these
        // must not push the image out of reach.
        ...Array.from({ length: 20 }, () =>
          [
            JSON.stringify({
              type: "assistant",
              message: { content: [{ type: "tool_use", name: "Read", input: { file: "a.ts" } }] },
            }),
            JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
          ].join("\n"),
        ),
      ].join("\n"),
    );
    const payload = JSON.stringify({ prompt: "右边那块间距别扭，帮我调一下", transcript_path: tp });
    const call = (llmJson: Record<string, string>) => {
      const cfgDir = join(d, `cfg-${Object.keys(llmJson).join("-") || "none"}`);
      mkdirSync(cfgDir, { recursive: true });
      writeFileSync(join(cfgDir, "llm.json"), JSON.stringify(llmJson));
      return spawnHook(["bun", "run", join(HERE, "prompt-forge.ts")], payload, {
        PROMPT_FORGE_TEST_MOCK: '{"verdict":"pass"}',
        CCOBS_DIR: cfgDir,
      });
    };

    expect(
      (await call({ default: "prov/text", vision: "prov/sees-images" })).stderr,
    ).toContain("vision: 1 recent image");
    expect((await call({ default: "prov/text" })).stderr).not.toContain("vision:");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, TIMEOUT);

test("prompt-forge-transcript-prune", async () => {
  // Session JSONL pruning: text/thinking/tool_use (input capped at 2K) are
  // kept; tool_result blocks, base64 images, and junk lines are dropped.
  const d = tmp();
  try {
    const tp = join(d, "t.jsonl");
    const big = "A".repeat(10_000);
    writeFileSync(
      tp,
      [
        JSON.stringify({ type: "user", message: { role: "user", content: "hello world" } }),
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "thinking", thinking: "pondering" },
              { type: "text", text: "reading file" },
              { type: "tool_use", name: "Read", input: { big } },
            ],
          },
        }),
        JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: big }] } }),
        JSON.stringify({ type: "user", message: { content: [{ type: "image", source: { data: big } }] } }),
        "not json",
      ].join("\n"),
    );
    const res = await spawnHook(
      ["bun", "run", join(HERE, "prompt-forge.ts")],
      JSON.stringify({
        prompt: "make the authentication system more robust and fix all the issues",
        transcript_path: tp,
      }),
      { PROMPT_FORGE_TEST_MOCK: '{"verdict":"pass"}' },
    );
    // Mirror the expected pruned output: 10K tool_result/image blobs gone,
    // tool_use input capped to 2000 chars + ellipsis.
    const cappedInput = JSON.stringify({ big }).slice(0, 2_000) + "…";
    const expected =
      "user: hello world\n\n" +
      `assistant: [thinking] pondering\nreading file\n[tool_use] Read ${cappedInput}`;
    expect(res.stderr).toContain(`pruned transcript ${expected.length} chars`);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}, TIMEOUT);
