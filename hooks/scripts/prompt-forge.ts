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
import { readFileSync, existsSync, appendFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Codepoints. Deliberately low: 15 swallowed whole Chinese sentences
// ("把那个配置清理一下顺便更新文档" is 15) that are exactly the fuzzy prompts worth
// enriching. Confirmations are covered by CONFIRMATION_WORDS, not by length.
const GATE1_MAX_LENGTH = 6;

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

// Prompts already carrying a concrete anchor — backtick code span, a
// path-like token, a file extension, foo(), or a :line ref — skip the LLM.
const SPECIFIC_HINT_RE =
  /`[^`]+`|[\w.@~-]+\/[\w.@-]|\w\.(ts|tsx|js|jsx|mjs|py|md|json|go|rs|java|rb|sh|zsh|yml|yaml|toml|sql|css|html|vue|c|h|cpp)\b|\w+\(\)|:\d+\b/i;

// Pasted images reach the hook as `[Image #N]` placeholders only — the base64
// lives in the transcript, which has not been written yet when the hook fires.
// Such a prompt points at pixels the classifier cannot see, so it passes through.
const IMAGE_REF_RE = /\[Image #\d+\]/;

// reasoning_effort=max runs 4-70s with a long tail. A 90s cap costs no rewrite
// seen in the ledger while cutting the pathological tail; tighter caps (45s,
// 30s) start discarding useful rewrites for little wall-clock saved.
const LLM_CALL_TIMEOUT_MS = 90_000;
// Worst-case budget vs the 125s hooks.json timeout:
// 4×git(1s each) + bun boot(~0.5s) + 90s LLM ≈ 94.5s < 125s. Signals are
// best-effort — a slow repo just loses the signal, never blocks the user.
const GIT_TIMEOUT_MS = 1_000;

// Transcript budget after pruning. Raw session JSONL reaches tens of MB
// (tool results, base64 images) and overflows the deepseek-v4-flash
// 1M-token window; keep the pruned tail well under it.
const MAX_TRANSCRIPT_CHARS = 500_000;
// tool_use inputs are kept as work trace but a single Write/Edit body can
// crowd the tail out of the budget — cap each block's serialized input.
const MAX_TOOL_USE_INPUT_CHARS = 2_000;

// Vision routing. The window is counted in USER turns, not JSONL entries: one
// assistant work loop writes dozens of tool_use/tool_result entries between two
// user prompts, so an entry-counted window never reaches the image. Two user
// turns back is what a follow-up like "这个按钮改一下" still refers to; older
// images are stale and each one costs ~3K prompt tokens on a slower provider.
const IMAGE_LOOKBACK_USER_TURNS = 2;
const MAX_IMAGES = 2;
const MAX_IMAGE_CHARS = 4_000_000; // ~3MB of image, per image
const MAX_IMAGE_SCAN_LINES = 300; // backstop: never parse a whole long transcript
const VISION_MODEL = "openai/gpt-5.6-luna";
const VISION_BASE_URL = "https://openrouter.ai/api/v1";

// ---------------------------------------------------------------------------
// Resolve paths relative to this script
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(SCRIPT_DIR, "..", "..");
const LLM_CALL_SCRIPT = join(PLUGIN_ROOT, "skills", "llm-call", "scripts", "call.ts");

// ---------------------------------------------------------------------------
// Logging (stderr only — stdout must stay pure hook JSON)
// ---------------------------------------------------------------------------

// Durable outcome ledger — one JSONL line per hook run, queryable after the fact.
const LEDGER_PATH = join(
  process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability"),
  "prompt-forge.log",
);
let transcriptChars = 0; // set by buildLLMPayload, read at ledger exits
let transcriptText = ""; // ditto — the provenance corpus for the enriched prompt
let visionImages = 0; // ditto — how many recent images were sent to the classifier

function ledger(fields: Record<string, unknown>): void {
  try {
    appendFileSync(LEDGER_PATH, JSON.stringify({ ts: new Date().toISOString(), ...fields }) + "\n");
  } catch { /* ledger is best-effort — never block the hook */ }
}

function log(msg: string): void {
  process.stderr.write(`[prompt-forge] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Gate 1
// ---------------------------------------------------------------------------

function gate1Pass(prompt: string): { pass: boolean; reason?: string } {
  const text = prompt.trim();
  // Slash commands expand to their own instructions — never rewrite them.
  if (text.startsWith("/")) {
    return { pass: true, reason: "slash command" };
  }
  // Confirmation words first — the list is meant to pass regardless of length.
  if (CONFIRMATION_WORDS.has(text.toLowerCase())) {
    return { pass: true, reason: "confirmation word" };
  }
  // Whitespace stripped everywhere, not just at the ends: "改 一下 这个" is
  // 5 codepoints of instruction, and spaces must not push it past the gate.
  const len = [...text.replace(/\s+/g, "")].length;
  if (len <= GATE1_MAX_LENGTH) {
    return { pass: true, reason: `short input (${len} ≤ ${GATE1_MAX_LENGTH})` };
  }
  if (SPECIFIC_HINT_RE.test(text)) {
    return { pass: true, reason: "specific anchor (path/code ref)" };
  }
  if (IMAGE_REF_RE.test(text)) {
    return { pass: true, reason: "image attached" };
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

// Is the prompt being classified already on disk? Answers whether the hook
// runs before or after the turn is appended — the same question that decides
// whether a just-pasted image is ever reachable. Reads the tail only.
function promptOnDisk(transcriptPath: string | undefined, prompt: string): boolean | null {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  try {
    const size = statSync(transcriptPath).size;
    const span = Math.min(size, 256 * 1024);
    const fd = openSync(transcriptPath, "r");
    const buf = Buffer.alloc(span);
    readSync(fd, buf, 0, span, size - span);
    closeSync(fd);
    // JSON-encoded, so compare against the escaped form of a distinctive slice.
    const probe = JSON.stringify(prompt.slice(0, 60)).slice(1, -1);
    return buf.toString("utf-8").includes(probe);
  } catch {
    return null;
  }
}

// Images the classifier can actually see. The turn being classified is never
// on disk yet, so a freshly pasted image is out of reach — but the screenshot
// from a turn or two ago is exactly what a follow-up like "这个按钮改一下"
// refers to, and that one is readable.
function recentImages(transcriptPath: string | undefined): { media_type: string; data: string }[] {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  let raw: string;
  try { raw = readFileSync(transcriptPath, "utf-8"); } catch { return []; }
  const lines = raw.split("\n");
  const found: { media_type: string; data: string }[] = [];
  let userTurns = 0;
  let linesScanned = 0;
  for (let i = lines.length - 1; i >= 0 && userTurns < IMAGE_LOOKBACK_USER_TURNS; i--) {
    if (!lines[i].trim()) continue;
    if (++linesScanned > MAX_IMAGE_SCAN_LINES) break;
    let entry: any;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    const content = entry.message?.content;
    // A tool_result is typed "user" but is not a user turn; neither is an
    // image-only entry, which is the carrier of the image we are looking for.
    if (entry.type === "user" &&
        (typeof content === "string" ||
          (Array.isArray(content) && content.some((b: any) => b?.type === "text")))) {
      userTurns++;
    }
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type !== "image" || b.source?.type !== "base64") continue;
      const data = String(b.source.data ?? "");
      if (!data || data.length > MAX_IMAGE_CHARS) continue;
      found.unshift({ media_type: String(b.source.media_type ?? "image/png"), data });
    }
    if (found.length >= MAX_IMAGES) break;
  }
  return found.slice(-MAX_IMAGES);
}

// Prune session JSONL to user/assistant turns. Kept: text, thinking, and
// tool_use (input capped) — the assistant's work trace. Dropped: tool_result
// and base64 images, the token bulk. Tail-capped to budget.
function transcriptContent(transcriptPath: string | undefined): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  let raw: string;
  try {
    raw = readFileSync(transcriptPath, "utf-8");
  } catch {
    return "";
  }
  const turns: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    const content = entry.message?.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const b of content) {
        if (b?.type === "text" && typeof b.text === "string") {
          parts.push(b.text);
        } else if (b?.type === "thinking" && typeof b.thinking === "string") {
          parts.push(`[thinking] ${b.thinking}`);
        } else if (b?.type === "tool_use") {
          let input = "";
          try { input = JSON.stringify(b.input ?? {}); } catch { /* keep name only */ }
          if (input.length > MAX_TOOL_USE_INPUT_CHARS) {
            input = input.slice(0, MAX_TOOL_USE_INPUT_CHARS) + "…";
          }
          parts.push(`[tool_use] ${b.name} ${input}`);
        }
      }
      text = parts.join("\n");
    }
    text = text.trim();
    if (text) turns.push(`${entry.type}: ${text}`);
  }
  const joined = turns.join("\n\n");
  return joined.length > MAX_TRANSCRIPT_CHARS ? joined.slice(-MAX_TRANSCRIPT_CHARS) : joined;
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

// With a transcript, the session itself says what the user is pointing at, so
// naming those targets is grounded. Repository signals still are not: a file
// changed in the last commit is not thereby the file this prompt means.
const EVIDENCE_RULES = `## Sourcing (transcript available)

Every file path, function name, or plan name you write MUST appear verbatim in the user's prompt or the session transcript. Repository signals give background only — never lift a path out of changed_files or recent_commits into the enriched prompt. If the right target is not in the transcript, describe it in words instead of naming a file.`;

const NO_EVIDENCE_RULES = `## Sourcing (no transcript — the session has no history yet)

**This section overrides the classification criteria above.** Judge fuzziness by
completeness of the instruction, NOT by whether it names files: a prompt is FUZZY
whenever its action, its object, its scope, or its completion condition is left
implicit. Absent paths are not a reason to pass — they are unavailable to you here.

You have no evidence of what the user is referring to. Enrich the WORDING only:
- Expand the elided action, object, scope, and acceptance criteria into a complete instruction.
- Write NO file paths, NO function names, NO commit hashes, NO branch names. Not one. You have no basis for any of them.
- Describe targets by their role ("the configuration item named voice_key and every reference to it"), and let the agent locate them.
- Keep it to a single short paragraph.`;

function buildLLMPayload(
  prompt: string,
  cwd: string,
  transcriptPath: string | undefined,
): Record<string, unknown> {
  const history = transcriptContent(transcriptPath);
  transcriptChars = history.length;
  transcriptText = history;
  // No transcript means no evidence of what the user is referring to. Git
  // signals describe what the repo did recently, not what the user wants —
  // offering them here invites the model to pass one off as the other, so
  // they are withheld rather than merely discouraged.
  const signals = history ? gitSignals(cwd) : {};
  log(`context: pruned transcript ${history.length} chars, git signals [${Object.keys(signals).join(", ") || "none"}]`);

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
1. Sharpen the action, its object, its scope, and how the user will know it is done
2. Replace vague references ("that thing", "the bug") with concrete targets from the transcript
3. Preserve the user's intent and tone — enrich, don't replace
4. Only include facts from the provided context — do NOT hallucinate file names or function names
5. If you cannot infer specifics from the context, flag the ambiguity: "TODO: clarify <what>"
6. Write naturally as if the user had been more specific — no meta-commentary about the enrichment itself

${history ? EVIDENCE_RULES : NO_EVIDENCE_RULES}`;

  // A screenshot from a recent turn is only useful to a model that can see it,
  // and only worth the switch when the vision provider is actually configured.
  const images = process.env.OPENROUTER_API_KEY ? recentImages(transcriptPath) : [];
  visionImages = images.length;
  if (images.length) log(`vision: ${images.length} recent image(s) → ${VISION_MODEL}`);

  const userPrompt = `Classify this user prompt:

\`\`\`
${prompt}
\`\`\`

${images.length ? `The image(s) below were shared earlier in this session and are what the user is most likely pointing at.\n` : ""}${contextBlock}

Return JSON: {"verdict": "pass"} if clear, or {"verdict": "rewrite", "enriched": "..."} if fuzzy.`;

  const userContent = images.length
    ? [
        { type: "text", text: userPrompt },
        ...images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.media_type};base64,${img.data}` },
        })),
      ]
    : userPrompt;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    ...(images.length && {
      model: VISION_MODEL,
      base_url: VISION_BASE_URL,
      api_key: process.env.OPENROUTER_API_KEY,
    }),
    max_tokens: 65_536, // llm-call cap; reasoning_effort=max burns most of it as CoT before content
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

// Paths the enriched prompt claims. A single slash with no extension is prose
// ("and/or", "CI/CD", "read/write"), so a path must carry a file extension,
// two separators, or a leading ./ ~/ or / — anything less is not worth
// discarding a rewrite over.
const PATH_TOKEN_RE =
  /(?<![\w.@/-])(?:[.~]?\/[\w.@-]+(?:\/[\w.@-]+)*|[\w.@-]+(?:\/[\w.@-]+){2,}|(?:[\w.@~-]+\/)*[\w-]+\.(?:ts|tsx|js|jsx|mjs|py|md|json|go|rs|java|rb|sh|zsh|yml|yaml|toml|sql|css|html|vue|c|h|cpp)\b)/g;

// A path the model invented is worse than no enrichment at all. The corpus is
// the user's own words plus the session — NEVER the git signals, which are
// exactly where the fabricated paths come from. Cost of a false alarm: the
// rewrite is dropped and the prompt passes through unchanged.
function unsourcedPaths(enriched: string, corpus: string): string[] {
  const found = enriched.match(PATH_TOKEN_RE) ?? [];
  return [...new Set(found.filter((p) => !corpus.includes(p)))];
}

function formatAdditionalContext(enriched: string): string {
  return (
    "[prompt-forge] 你的原始输入经分析后已增强为以下指令，可作为执行依据。\n" +
    "这是对你意图的一种展开；如与仓库实际不符，以仓库实际为准。\n\n" +
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
  const sid = String(payload.session_id || "");
  const cwd = String(payload.cwd || ".");
  const transcriptPath = payload.transcript_path
    ? String(payload.transcript_path)
    : undefined;

  if (g1.pass) {
    log(`gate1 pass: ${g1.reason}`);
    ledger({
      session_id: sid, gate: 1, verdict: "pass", reason: g1.reason,
      prompt_chars: [...prompt].length, cwd,
      ...(g1.reason === "image attached" && { prompt_on_disk: promptOnDisk(transcriptPath, prompt) }),
    });
    return;
  }

  // Gate 2: LLM classification

  const shown = [...prompt].slice(0, 60).join("");
  log(`gate2: classifying ${JSON.stringify(shown)} (${[...prompt].length} chars) via llm-call`);

  const llmPayload = buildLLMPayload(prompt, cwd, transcriptPath);
  const t0 = Date.now();
  const result = callLLM(llmPayload);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const g2 = {
    session_id: sid,
    gate: 2,
    elapsed_s: Number(elapsed),
    prompt_chars: [...prompt].length,
    transcript_chars: transcriptChars,
    mode: transcriptChars ? "evidence" : "no-evidence",
    ...(visionImages && { vision: VISION_MODEL, images: visionImages }),
    cwd,
    // null = no transcript file at all; false = the file exists but this turn
    // is not in it yet, so a just-pasted image is unreachable.
    prompt_on_disk: promptOnDisk(transcriptPath, prompt),
  };
  if (!result) {
    log(`gate2 llm-call failed in ${elapsed}s → fail-open, prompt unchanged`);
    ledger({ ...g2, verdict: "fail-open" });
    return;
  }
  if (result.verdict !== "rewrite") {
    log(`gate2 verdict=pass in ${elapsed}s → prompt unchanged`);
    ledger({ ...g2, verdict: "pass" });
    return;
  }
  const enriched = String(result.enriched || "").trim();
  if (!enriched) {
    log("gate2 verdict=rewrite but enriched empty → fail-open, prompt unchanged");
    ledger({ ...g2, verdict: "fail-open", reason: "enriched empty" });
    return;
  }

  const unsourced = unsourcedPaths(enriched, `${prompt}\n${transcriptText}`);
  if (unsourced.length) {
    log(`gate2 rewrite cites unsourced paths [${unsourced.join(", ")}] → discarded, prompt unchanged`);
    ledger({ ...g2, verdict: "discarded", reason: "unsourced paths", unsourced });
    return;
  }

  log(`gate2 verdict=rewrite in ${elapsed}s (enriched=${[...enriched].length} chars) → injecting additionalContext`);
  ledger({ ...g2, verdict: "rewrite", enriched_chars: [...enriched].length });
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: formatAdditionalContext(enriched),
    },
  }));
}

try { run(); } catch (e) {
  log(`fatal: ${e instanceof Error ? e.message : String(e)} → fail-open`);
  ledger({ verdict: "fatal", reason: String(e instanceof Error ? e.message : e).slice(0, 200) });
}
process.exit(0);
