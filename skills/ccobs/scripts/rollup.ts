#!/usr/bin/env bun
// ccobs rollup — folds observations.learn_candidates into one markdown rule digest
// per scope (each project + a cross-project `_global`). Incremental: reads the
// existing digest plus only the candidates distilled after its watermark.
//
// Why the model never rewrites existing lines: a human edits these files in
// /debrief to delete or reword a rule that turned out wrong. So the model only
// classifies each NEW candidate as "same as existing rule #n" or "new"; the
// counting, wording and ordering are done here in code.
//
// Provider: same resolution as distill.ts (llm.json override, else *_API_KEY env).
//
// Usage:
//   bun rollup.ts                 # incremental, all scopes
//   bun rollup.ts --scope <name>  # one project key, or _global
//   bun rollup.ts --dry-run       # print what would be merged, call nothing
//   bun rollup.ts --full          # ignore watermarks, rebuild from scratch
//   bun rollup.ts --max-batches 60  # raise the per-scope cap for a cold build

import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GLOBAL_SCOPE as GLOBAL, OBS_DIR, RULES_DIR, digestPath, normalizeScope, parseRuleLine, renderRuleLine, type Rule } from "./rules-digest.ts";

const DB_PATH = join(OBS_DIR, "obs.db");
const BAK_DIR = join(RULES_DIR, ".bak");
const CONFIG = join(OBS_DIR, "llm.json");
const BATCH = 25; // candidates per model call
const MAX_BATCHES = 10; // per scope per run; a cold build catches up over several runs (--max-batches to override)
const EXISTING_CAP = 150; // rules shown to the model; the sunken tail is not worth matching against
const MIN_COLD_CANDS = 5; // a brand-new scope with fewer signals than this isn't worth a file yet
const KEEP_BAKS = 5;
const EPOCH = "1970-01-01T00:00:00.000Z";

const PROVIDERS = [
  { env: "DEEPSEEK_API_KEY", base_url: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" },
  { env: "GEMINI_API_KEY", base_url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.1-flash-lite" },
  { env: "OPENROUTER_API_KEY", base_url: "https://openrouter.ai/api/v1", model: "openrouter/free" },
  { env: "LMSTUDIO_API_KEY", base_url: "http://localhost:1234/v1", model: "local" },
];

function resolveCfg(): { base_url: string; model: string; api_key: string } | null {
  if (existsSync(CONFIG)) return JSON.parse(readFileSync(CONFIG, "utf8"));
  for (const p of PROVIDERS) {
    const key = process.env[p.env];
    if (key) return { base_url: p.base_url, model: p.model, api_key: key };
  }
  return null;
}

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.indexOf(n) !== -1 ? args[args.indexOf(n) + 1] : null);

// ---------------------------------------------------------------------------
// digest file format
// ---------------------------------------------------------------------------

const WATERMARK_RE = /^<!-- ccobs-rollup watermark: (.+?) -->$/;

function parseDigest(scope: string): { watermark: string; rules: Rule[] } {
  const p = digestPath(scope);
  if (!existsSync(p)) return { watermark: EPOCH, rules: [] };
  let watermark = EPOCH;
  const rules: Rule[] = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const w = WATERMARK_RE.exec(line);
    if (w) { watermark = w[1]; continue; }
    const r = parseRuleLine(line);
    if (r) rules.push(r);
  }
  return { watermark, rules };
}

function renderDigest(scope: string, watermark: string, rules: Rule[]): string {
  const sorted = [...rules].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  const title = scope === GLOBAL ? "跨项目规则" : `项目规则 · ${scope}`;
  return [
    `<!-- ccobs-rollup watermark: ${watermark} -->`,
    `# ${title}`,
    "",
    "由 ccobs rollup 从会话观测聚出。重复次数=置信度，最近日期=新鲜度。",
    "被证伪的规则请直接删行或就地改写：下一轮只会追加，不会改动已有行。",
    "",
    ...sorted.map(renderRuleLine),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

const MERGE_PROMPT = `你在维护一份规则清单。下面是已有规则（带编号）和一批新候选（带字母）。

对每条新候选，判断它说的是不是某条已有规则的同一件事：
- 是某条已有规则 → same 填该规则的编号（数字）
- 是本批中更早某条候选的重复 → same 填那条候选的字母
- 都不是 → same 填 null，并给出规范化后的规则文本（一句话，祈使句，不超过 40 字，去掉会话专属的细节）

每条候选都要出现在结果里。只输出 JSON，形如：
{"map":[{"c":"A","same":3},{"c":"B","same":null,"text":"改判据类逻辑必须先证明它能判红"},{"c":"C","same":"B"}]}

已有规则：
{{EXISTING}}

新候选：
{{NEW}}`;

function extractJson(text: string): any {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e <= s) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(s, e + 1));
}

function letter(i: number): string {
  // A..Z, then AA, AB, ... enough for BATCH=60
  return i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

async function mergeBatch(
  cfg: { base_url: string; model: string; api_key: string },
  rules: Rule[],
  batch: { text: string; day: string }[],
): Promise<void> {
  const visible = [...rules].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, EXISTING_CAP);
  const existing = visible.length ? visible.map((r, i) => `${i + 1}. ${r.text}`).join("\n") : "（暂无）";
  const news = batch.map((c, i) => `${letter(i)}. ${c.text}`).join("\n");
  const res = await fetch(`${cfg.base_url}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { "Content-Type": "application/json", ...(cfg.api_key ? { Authorization: `Bearer ${cfg.api_key}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      // 这是分类活,不是推理活。放开思考的话 deepseek-v4-flash 会把预算全烧在
      // reasoning 上、content 返回空串,请求就那么挂着(实测 90s 不返回)。
      reasoning_effort: "none",
      max_tokens: 8000,
      messages: [{ role: "user", content: MERGE_PROMPT.replace("{{EXISTING}}", existing).replace("{{NEW}}", news) }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = extractJson((await res.json() as any).choices[0].message.content);
  const entries = (Array.isArray(j.map) ? j.map : [])
    .map((e: any) => ({ e, idx: batch.findIndex((_, i) => letter(i) === String(e.c)) }))
    .filter((x: any) => x.idx !== -1)
    .sort((a: any, b: any) => a.idx - b.idx); // "same as an earlier letter" only resolves in order
  const resolved = new Map<string, Rule>();
  for (const { e, idx } of entries) {
    const day = batch[idx].day;
    const num = Number(e.same);
    let rule: Rule | undefined;
    if (Number.isInteger(num) && num >= 1 && num <= visible.length) rule = visible[num - 1];
    else if (typeof e.same === "string") rule = resolved.get(e.same);
    if (!rule) {
      // collapse whitespace: a newline would split one rule across two lines and
      // the tail, not starting with "- ", would be silently dropped on the next read
      const text = String(e.text ?? batch[idx].text).replace(/\s+/g, " ").trim().slice(0, 120);
      if (!text) continue;
      rule = rules.find((r) => r.text === text);
      if (!rule) {
        rule = { text, count: 0, last: day };
        rules.push(rule);
      }
    }
    rule.count += 1;
    if (day > rule.last) rule.last = day;
    resolved.set(String(e.c), rule);
  }
}

// ---------------------------------------------------------------------------
// write with lost-update guard
// ---------------------------------------------------------------------------

function mtimeOf(p: string): number {
  try { return statSync(p).mtimeMs; } catch { return -1; }
}

function writeDigest(scope: string, body: string, mtimeBefore: number): boolean {
  const p = digestPath(scope);
  if (mtimeOf(p) !== mtimeBefore) return false; // someone edited it while we were merging; drop this round
  if (existsSync(p)) {
    mkdirSync(BAK_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    copyFileSync(p, join(BAK_DIR, `${scope}.${stamp}.md`));
    const olds = readdirSync(BAK_DIR).filter((f) => f.startsWith(`${scope}.`)).sort();
    for (const f of olds.slice(0, Math.max(0, olds.length - KEEP_BAKS))) unlinkSync(join(BAK_DIR, f));
  }
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, body);
  if (mtimeOf(p) !== mtimeBefore) { unlinkSync(tmp); return false; }
  renameSync(tmp, p);
  return true;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH, { readonly: true });

// distilled_at, not ended_at: distill lags 30 minutes, retries failures and
// re-runs sessions on demand, so late-arriving old sessions are normal.
const rows = db
  .prepare(
    `SELECT s.project, o.learn_candidates, o.distilled_at
     FROM observations o JOIN sessions s ON s.session_id = o.session_id
     WHERE o.learn_candidates IS NOT NULL AND o.learn_candidates NOT IN ('[]', '')
     ORDER BY o.distilled_at ASC`,
  )
  .all() as { project: string; learn_candidates: string; distilled_at: string }[];

type Cand = { text: string; day: string; at: string };
const buckets = new Map<string, Cand[]>();
for (const r of rows) {
  let arr: unknown;
  try { arr = JSON.parse(r.learn_candidates); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  const day = r.distilled_at.slice(0, 10);
  for (const c of arr) {
    const text = String(c ?? "").trim();
    if (!text) continue;
    const cand: Cand = { text: text.slice(0, 200), day, at: r.distilled_at };
    for (const scope of [normalizeScope(r.project), GLOBAL]) {
      const b = buckets.get(scope) ?? [];
      b.push(cand);
      buckets.set(scope, b);
    }
  }
}

const only = opt("--scope");
const scopes = only ? [only] : [...buckets.keys()];

const cfg = flag("--dry-run") ? null : resolveCfg();
if (!flag("--dry-run") && !cfg) {
  console.log("ccobs rollup: 无 llm.json 且四个 *_API_KEY 环境变量均未设置，跳过");
  process.exit(0);
}
mkdirSync(RULES_DIR, { recursive: true });

let touched = 0;
for (const scope of scopes) {
  const before = parseDigest(scope);
  const since = flag("--full") ? EPOCH : before.watermark;
  const all = buckets.get(scope) ?? [];
  const cands = all.filter((c) => c.at > since);
  if (!cands.length) continue;
  if (!before.rules.length && all.length < MIN_COLD_CANDS) continue;

  if (flag("--dry-run")) {
    console.log(`${scope}: ${before.rules.length} 条已有规则 + ${cands.length} 条新候选 (watermark ${since})`);
    continue;
  }

  const mtimeBefore = mtimeOf(digestPath(scope));
  const rules = flag("--full") ? [] : before.rules;
  let watermark = since;
  let batches = 0;
  const maxBatches = Number(opt("--max-batches") ?? MAX_BATCHES);
  for (let i = 0; i < cands.length && batches < maxBatches; i += BATCH, batches++) {
    const batch = cands.slice(i, i + BATCH);
    try {
      await mergeBatch(cfg!, rules, batch);
    } catch (e) {
      // advance past it anyway: a batch that fails deterministically (truncated
      // JSON, say) would otherwise stall this scope forever
      console.error(`  ${scope}: batch ${batches} 丢弃 ${batch.length} 条候选: ${e}`);
    }
    watermark = batch[batch.length - 1].at;
  }
  if (watermark === since) continue;
  if (writeDigest(scope, renderDigest(scope, watermark, rules), mtimeBefore)) {
    touched++;
    console.log(`  ${scope}: ${rules.length} 条规则, watermark → ${watermark}`);
  } else {
    console.error(`  ${scope}: 摘要文件在合并期间被改动，本轮放弃`);
  }
}
console.log(`ccobs rollup: ${touched} 份摘要更新`);
