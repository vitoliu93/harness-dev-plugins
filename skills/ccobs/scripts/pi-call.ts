#!/usr/bin/env bun
// The plugin's single model access layer. Every LLM call in this repo goes
// through here and out to `pi -p` headless; pi owns provider auth, we own
// nothing but the scenario name.
//
// Which model serves which scenario lives on the user side, in
// ${CCOBS_DIR}/llm.json — a flat map, no model string is baked in here:
//   {"default": "openrouter/openai/gpt-5.6-luna:low",
//    "distill": "deepseek/deepseek-v4-flash",
//    "rollup":  "deepseek/deepseek-v4-flash:off"}
// Thinking effort rides pi's own ":level" suffix (off|minimal|low|…|max).
//
// Never throws: every failure returns null so a hook can stay silent. Four
// failure modes are all treated the same, and an exit code alone catches only
// the first:
//   1. non-zero exit
//   2. the event stream finished with no non-empty text (the FIRST agent_end
//      can carry an empty content array; the answer is in the last one)
//   3. wall clock cap — pi has no --timeout, so the child is killed here
//   4. retries exhausted (pi retries the same model 3x on 429 by itself)
//
// pi has no model-level fallback: `openRouterRouting.allow_fallbacks` swaps the
// upstream provider inside one model, not the model. A second model would go
// right here, before returning null.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HERMETIC = ["--no-session", "--no-skills", "--no-extensions", "--no-context-files"];
// Off by default. The one caller that turns tools on is distill, for session
// files too big to read into our own process — see the `tools` option below.
const NO_TOOLS = "--no-tools";

// A hook does not get the interactive shell's PATH, and two things break there:
// a bare "pi" spawns ENOENT (which used to throw right past this module's
// never-throws contract), and pi itself is a `#!/usr/bin/env node` script, so it
// exits 127 unless node is reachable too. Hence both a resolved binary and a
// widened PATH for the child. fnm's default alias is the stable node path — the
// fnm_multishells entry on an interactive PATH belongs to one shell and dies with it.
const FALLBACK_PATH = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/share/fnm/aliases/default/bin`,
  "/opt/homebrew/bin",
  "/usr/local/bin",
].join(":");
const PI_BIN = process.env.PI_BIN ?? Bun.which("pi") ?? Bun.which("pi", { PATH: FALLBACK_PATH }) ?? "pi";

/** Resolved per call, not at import: CCOBS_DIR is what tests move around. */
export function llmConfigPath(): string {
  return join(process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability"), "llm.json");
}

export function llmConfigHint(): string {
  return (
    `缺 ${llmConfigPath()}，跳过。写一份就能跑，值是 pi 的 provider/model[:思考档]：\n` +
    `  {"default": "openrouter/openai/gpt-5.6-luna:low", "distill": "deepseek/deepseek-v4-flash"}`
  );
}

/**
 * Which model serves this scenario. No config file → null, and the caller skips
 * quietly; that is deliberate. Falling back to a built-in model would mean a
 * user who never wrote llm.json silently gets billed for a model they did not pick.
 *
 * `allowDefault: false` is for scenarios where the wrong model is worse than no
 * call — sending an image to a text-only model, say. Those need an explicit key.
 */
export function resolveModel(scenario: string, allowDefault = true): string | null {
  const path = llmConfigPath();
  if (!existsSync(path)) return null;
  const map = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  const model = allowDefault ? map[scenario] ?? map.default : map[scenario];
  return typeof model === "string" && model.trim() ? model.trim() : null;
}

/**
 * The JSON object out of whatever the model actually said. pi has no
 * response_format flag, so every JSON-shaped scenario leans on this plus a
 * system prompt that says "only JSON". Fenced output survives by accident:
 * the fence sits outside the outermost braces.
 */
export function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

export async function piCall(
  prompt: string,
  {
    scenario = "default",
    model = resolveModel(scenario) ?? undefined,
    system,
    files = [],
    tools = false,
    timeoutMs = 8000,
  }: {
    scenario?: string; model?: string; system?: string;
    files?: string[]; tools?: boolean; timeoutMs?: number;
  } = {},
): Promise<string | null> {
  if (!model) return null; // no llm.json, or no key for this scenario
  // ponytail: the prompt rides argv, and ARG_MAX is 1MB on this machine. Over
  // the line Bun.spawn throws E2BIG, the catch below eats it, and the caller
  // fails open with nothing in stderr — so refuse loudly instead. Files are
  // exempt: pi reads an @path itself, the bytes never reach argv. If a real
  // caller ever needs a prompt this big, write it to a file and pass it in files.
  const bytes = Buffer.byteLength(prompt);
  if (bytes > 900_000) {
    console.error(`[pi-call] prompt ${bytes} bytes exceeds the argv cap, skipping`);
    return null;
  }
  let killer: ReturnType<typeof setTimeout> | undefined;
  try {
    // With tools on, pi gets a live read/exec loop. Only worth it when the
    // input is too big to hand over any other way; everything else stays sealed.
    const argv = [PI_BIN, "-p", "--mode", "json", "--model", model, ...HERMETIC, ...(tools ? [] : [NO_TOOLS])];
    // Replaces pi's own ~400-token coding-assistant prompt rather than appending
    // to it, which is what lets a "only JSON, no prose" instruction go uncontested.
    if (system) argv.push("--system-prompt", system);
    // pi inlines an @file into the message body as <file name="…">…</file>, so
    // big payloads never touch argv (ARG_MAX is 1MB) and images arrive as pixels.
    // Inlines, not streams: an 8.6MB file measured 4.6M tokens and got a hard
    // 400 back. Anything that size has to go through `tools` instead.
    for (const f of files) argv.push(`@${f}`);
    argv.push(prompt);

    const proc = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "inherit", // pi's own errors (429, auth, bad model) are the only diagnostic we get
      stdin: "ignore",
      env: { ...process.env, PATH: `${process.env.PATH ?? ""}:${FALLBACK_PATH}` },
    });
    killer = setTimeout(() => proc.kill(9), timeoutMs);
    const out = await new Response(proc.stdout).text();
    if ((await proc.exited) !== 0) return null;
    let last = "";
    for (const line of out.split("\n")) {
      if (!line.startsWith("{")) continue;
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      const msgs = o.type === "agent_end" ? o.messages : o.type === "message_end" ? [o.message] : null;
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        if (m?.role !== "assistant") continue;
        const text = (Array.isArray(m.content) ? m.content : [])
          .filter((c: any) => c?.type === "text" && c.text)
          .map((c: any) => c.text)
          .join("\n")
          .trim();
        if (text) last = text; // keep the last non-empty one
      }
    }
    return last || null;
  } catch {
    return null;
  } finally {
    clearTimeout(killer);
  }
}

if (import.meta.main) {
  const t0 = Date.now();
  const scenario = process.argv[3] ?? "default";
  const answer = await piCall(process.argv[2] ?? "只回复 PONG", {
    scenario,
    timeoutMs: Number(process.argv[4] ?? 8000),
  });
  console.log(`[${Date.now() - t0}ms] [${scenario}=${resolveModel(scenario) ?? "未配置"}] ${answer ?? "(null)"}`);
}
