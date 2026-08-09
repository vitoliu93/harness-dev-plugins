#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: enrich fuzzy prompts with LLM-powered context injection.
 *
 * Two-gate pipeline:
 *   Gate 1 (zero-cost) — length ≤15 or confirmation word → pass through.
 *   Gate 2 (llm-call)   — classify: pass (clear) or rewrite (fuzzy).
 *                         On rewrite, inject an authoritative enriched prompt
 *                         via additionalContext.
 *
 * Enabled by default. Set PROMPT_FORGE=0 to disable.
 * Fail-open: any exception, timeout, or llm-call error → pass through.
 *
 * Observability: progress/result logs go to stderr (visible in the debug
 * log via `claude --debug` or `/log`). Stdout must stay pure hook JSON.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GATE1_MAX_LENGTH = 15; // codepoints

const CONFIRMATION_WORDS = new Set([
  // English
  "ok", "okay", "yes", "y", "yeah", "go", "done", "next", "continue",
  "proceed", "run", "sure", "fine", "good", "great", "cool", "k", "nice",
  "right", "ack", "acknowledged", "got it", "go ahead", "go on", "do it",
  "ship it", "lgtm", "+1", "yep", "yup", "alright", "lets go", "let's go",
  // Chinese
  "好", "好的", "行", "可以", "继续", "接着", "做", "干", "执行", "跑",
  "对", "嗯", "是的", "没错", "去吧", "来吧", "搞", "整", "继续做",
  "接着做", "搞吧", "整吧", "好了", "行吧", "干吧", "开始", "开工",
  // Emoji
  "👍", "✅", "👌", "🚀", "💯", "🙆", "🆗", "🎯",
]);

const LLM_CALL_TIMEOUT_MS = 60_000; // hook-level safety net
// Worst-case budget vs the 65s hooks.json timeout:
// 4×git(1s each) + bun boot(~0.5s) + 60s LLM ≈ 64.5s < 65s. Signals are
// best-effort — a slow repo just loses the signal, never blocks the user.
// Full transcript is sent; if it overflows the LLM context window the API
// returns an error → fail-open.
const GIT_TIMEOUT_MS = 1_000;

// ---------------------------------------------------------------------------
// Resolve paths relative to this script
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(SCRIPT_DIR, "..", "..");
const LLM_CALL_SCRIPT = join(PLUGIN_ROOT, "skills", "llm-call", "scripts", "call.ts");

// ---------------------------------------------------------------------------
// Logging (stderr only — stdout must stay pure hook JSON)
// ---------------------------------------------------------------------------

function log(msg: string): void {
  process.stderr.write(`[prompt-forge] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Gate 1
// ---------------------------------------------------------------------------

function gate1Pass(prompt: string): { pass: boolean; reason?: string } {
  const text = prompt.trim();
  // Confirmation words first — the list is meant to pass regardless of length.
  if (CONFIRMATION_WORDS.has(text.toLowerCase())) {
    return { pass: true, reason: "confirmation word" };
  }
  const len = [...text].length;
  if (len <= GATE1_MAX_LENGTH) {
    return { pass: true, reason: `short input (${len} ≤ ${GATE1_MAX_LENGTH})` };
  }
  return { pass: false };
}

// ---------------------------------------------------------------------------
// Git signals (best-effort)
// ---------------------------------------------------------------------------

function runGit(args: string[], cwd: string): string {
  try {
    const r = spawnSync("git", args, { cwd, timeout: GIT_TIMEOUT_MS, encoding: "utf-8" });
    return (r.stdout || "").trim();
  } catch {
    return "";
  }
}

function gitSignals(cwd: string): Record<string, string> {
  const signals: Record<string, string> = {};
  const branch = runGit(["branch", "--show-current"], cwd);
  if (branch) signals.branch = branch;
  const log = runGit(["log", "--oneline", "-5"], cwd);
  if (log) signals.recent_commits = log;
  const diff = runGit(["diff", "--name-only", "HEAD~1"], cwd);
  if (diff) signals.changed_files = diff;
  const status = runGit(["status", "--short"], cwd);
  if (status) signals.working_tree = status;
  return signals;
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

function transcriptContent(transcriptPath: string | undefined): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  try {
    return readFileSync(transcriptPath, "utf-8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

function buildLLMPayload(
  prompt: string,
  cwd: string,
  transcriptPath: string | undefined,
): Record<string, unknown> {
  const signals = gitSignals(cwd);
  const history = transcriptContent(transcriptPath);

  let contextBlock = "";
  if (Object.keys(signals).length > 0) {
    contextBlock += "## Repository context (read-only signals)\n";
    for (const [k, v] of Object.entries(signals)) {
      contextBlock += `\n**${k}**:\n\`\`\`\n${v}\n\`\`\`\n`;
    }
  }
  if (history) {
    contextBlock += `\n## Session transcript\n`;
    contextBlock += `\`\`\`\n${history}\n\`\`\`\n`;
  }

  const systemPrompt =
    `You are a prompt-quality classifier for an AI coding agent. Your job is to decide whether a user's prompt is CLEAR enough to execute directly, or FUZZY and in need of enrichment.

## Classification criteria

A prompt is **FUZZY** (needs enrichment) when it lacks:
- Specific file paths (e.g., "fix the bug" vs "fix the type error in src/auth/login.ts")
- Concrete action verbs with clear scope (e.g., "make it better" vs "extract the validation logic into a separate function")
- Disambiguated references (e.g., "the thing we discussed" vs "the Result<T,E> pattern from the last session")
- Identifiable targets (e.g., "update the dependency" vs "upgrade react from 18.2 to 19.0")

A prompt is **CLEAR** (pass through) when it has:
- File paths or unambiguous file descriptions
- Specific actions with scope boundaries
- Concrete parameters, version numbers, or configuration values
- Self-contained instructions that don't require reading session history to understand

## Positive examples (FUZZY — should rewrite)

1. "fix the bug" → no file, no bug description
2. "add the feature we discussed" → refers to unstated discussion
3. "make it faster" → no target, no approach
4. "refactor that mess" → no file, no standard
5. "update the config" → which config? what change?
6. "对接一下那个接口" → 哪个接口？在哪里？
7. "按上次的方案改" → 哪次？什么方案？

## Negative examples (CLEAR — should pass)

1. "在 src/components/LoginForm.tsx 中把 handleSubmit 的错误处理改成 Result<T, Error> 模式，参考 src/utils/result.ts 的实现" → files, function, pattern all specified
2. "rename all occurrences of userName to username in src/ directory, excluding test files" → operation, scope, exclusions clear
3. "add a rate limiter middleware at src/server/middleware/rateLimit.ts that allows 100 req/min per IP using the redis client from src/lib/redis.ts" → path, params, dependencies specified
4. "写一个 Python 脚本把 data/raw/*.csv 合并成 data/merged.parquet，按 timestamp 列排序去重" → inputs, outputs, operations clear
5. "upgrade @anthropic-ai/sdk from 0.39 to 0.45, fix all breaking changes in src/lib/ai.ts, run the test suite" → versions, target file, verification step
6. "把这个 PR #234 的改动 cherry-pick 到 release/2.28 分支，解决 src/auth/ 下的冲突" → PR number, target branch, conflict area clear

## Output format

Return a JSON object with exactly this schema:

If the prompt is CLEAR (pass):
{"verdict": "pass"}

If the prompt is FUZZY (needs enrichment):
{"verdict": "rewrite", "enriched": "<the rewritten, enriched prompt>"}

## Rewriting rules

When enriching, you MUST:
1. Add specific file paths inferred from the repository context (changed files, recent commits)
2. Replace vague references ("that thing", "the bug") with concrete targets from the transcript
3. Preserve the user's intent and tone — enrich, don't replace
4. Only include facts from the provided context — do NOT hallucinate file names or function names
5. If you cannot infer specifics from the context, flag the ambiguity: "TODO: clarify <what>"
6. Write naturally as if the user had been more specific — no meta-commentary about the enrichment itself`;

  const userPrompt = `Classify this user prompt:

\`\`\`
${prompt}
\`\`\`

${contextBlock}

Return JSON: {"verdict": "pass"} if clear, or {"verdict": "rewrite", "enriched": "..."} if fuzzy.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 4096,
    temperature: 0,
    response_format: "json_object",
  };
}

function callLLM(payload: Record<string, unknown>): Record<string, unknown> | null {
  // Test hook: skip real LLM call when mock response is provided
  const mock = process.env.PROMPT_FORGE_TEST_MOCK;
  if (mock) {
    log("PROMPT_FORGE_TEST_MOCK set — using mock response");
    try { return JSON.parse(mock) as Record<string, unknown>; } catch { return null; }
  }

  try {
    const proc = spawnSync("bun", ["run", LLM_CALL_SCRIPT], {
      input: JSON.stringify(payload),
      timeout: LLM_CALL_TIMEOUT_MS,
      encoding: "utf-8",
      env: process.env,
    });
    if (proc.status !== 0 || proc.error) return null;
    const outer = JSON.parse((proc.stdout || "").trim());
    const content = outer.content;
    if (!content || typeof content !== "string") return null;
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatAdditionalContext(enriched: string): string {
  return (
    "[prompt-forge] 你的原始输入经分析后已增强为以下指令，请以此为准执行。\n" +
    "原始输入被保留为参考，但下述重写版本更完整、更具体。\n\n" +
    "## Enriched Prompt\n" +
    enriched
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  if (process.env.PROMPT_FORGE === "0") {
    log("disabled (PROMPT_FORGE=0)");
    return;
  }

  const stdin = readFileSync(0, "utf-8").trim();
  if (!stdin) return;

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(stdin) as Record<string, unknown>; } catch { return; }

  const prompt = String(payload.prompt || "").trim();
  if (!prompt) return;

  // Gate 1: zero-cost pass-through
  const g1 = gate1Pass(prompt);
  if (g1.pass) {
    log(`gate1 pass: ${g1.reason}`);
    return;
  }

  // Gate 2: LLM classification
  const cwd = String(payload.cwd || ".");
  const transcriptPath = payload.transcript_path
    ? String(payload.transcript_path)
    : undefined;

  const shown = [...prompt].slice(0, 60).join("");
  log(`gate2: classifying ${JSON.stringify(shown)} (${[...prompt].length} chars) via llm-call`);

  const llmPayload = buildLLMPayload(prompt, cwd, transcriptPath);
  const t0 = Date.now();
  const result = callLLM(llmPayload);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!result) {
    log(`gate2 llm-call failed in ${elapsed}s → fail-open, prompt unchanged`);
    return;
  }
  if (result.verdict !== "rewrite") {
    log(`gate2 verdict=pass in ${elapsed}s → prompt unchanged`);
    return;
  }
  const enriched = String(result.enriched || "").trim();
  if (!enriched) {
    log("gate2 verdict=rewrite but enriched empty → fail-open, prompt unchanged");
    return;
  }

  log(`gate2 verdict=rewrite in ${elapsed}s (enriched=${[...enriched].length} chars) → injecting additionalContext`);
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: formatAdditionalContext(enriched),
    },
  }));
}

try { run(); } catch (e) {
  log(`fatal: ${e instanceof Error ? e.message : String(e)} → fail-open`);
}
process.exit(0);
