#!/usr/bin/env bun
// ccobs distill runner — semantic layer. Reads undistilled main sessions from obs.db,
// digests their raw JSONL (user text + assistant text + tool names, NO tool outputs),
// asks a cheap OpenAI-compatible model to fill the observations table.
//
// Model: whatever ${CCOBS_DIR}/llm.json maps the "distill" scenario to; the call
// itself goes out through pi (see pi-call.ts). No llm.json → skip quietly.
//
// Usage:
//   bun distill.ts                  # distill up to 50 pending sessions
//   bun distill.ts --limit 5
//   bun distill.ts --dry-run        # print digest+prompt for one session, call nothing
//   bun distill.ts --session <id>   # redo one session (e.g. after prompt/model swap)

import { Database } from "bun:sqlite";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { READ_ONLY_TOOLS, extractJson, llmConfigHint, piCall, resolveModel } from "./pi-call.ts";
import { OBS_DIR } from "./rules-digest.ts";

const DB_PATH = join(OBS_DIR, "obs.db");
const PROMPT_TPL = readFileSync(join(import.meta.dir, "distill-prompt.md"), "utf8");
const DIGEST_CAP = 20_000; // chars; keep head+tail, endings decide `outcome`
// Above this we stop reading the file ourselves and hand pi the path. readFileSync
// on a huge file is a native crash, not a catchable throw — 2026-07-22 that killed
// the whole pipeline for two weeks (a 2.8GB Cursor state.vscdb), which is why the
// heartbeat file exists. 8MB is well under anything that has ever crashed us; the
// point is to stop pulling tens of MB into a cron process at all.
const BIG_FILE = 8 * 1024 * 1024;
// --system-prompt REPLACES pi's own coding-assistant prompt, so this is the whole
// instruction the model gets besides the task. pi has no response_format flag.
const JSON_ONLY = "You return one JSON object and nothing else. No prose, no code fences.";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};

function buildDigest(filePath: string): string {
  const lines: string[] = [];
  for (const raw of readFileSync(filePath, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(raw);
    } catch {
      continue;
    }
    const m = o.message ?? {};
    if (o.type === "user") {
      const texts: string[] = [];
      if (typeof m.content === "string") texts.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const c of m.content) if (c?.type === "text" && c.text) texts.push(c.text);
      }
      for (const t of texts) {
        if (t.startsWith("<system-reminder") || t.includes('"type":"tool_result"')) continue;
        lines.push(`[用户] ${t.slice(0, 600)}`);
      }
    } else if (o.type === "assistant") {
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c?.type === "text" && c.text) lines.push(`[助手] ${c.text.slice(0, 400)}`);
        else if (c?.type === "tool_use") {
          const inp = c.input ?? {};
          const detail =
            c.name === "Skill" ? `:${inp.skill}` :
            c.name === "Agent" || c.name === "Task" ? `:${inp.subagent_type}(model=${inp.model ?? "缺省"})` : "";
          lines.push(`→ ${c.name}${detail}`);
        }
      }
    }
  }
  const full = lines.join("\n");
  if (full.length <= DIGEST_CAP) return full;
  return full.slice(0, DIGEST_CAP * 0.6) + "\n...[中段截断]...\n" + full.slice(-DIGEST_CAP * 0.4);
}

// 摘要是删过的:工具输出全没了,超过 DIGEST_CAP 还会砍掉中段。判不准的时候
// 让模型自己去翻原始文件,比逼它在 unknown 上瞎猜强。
function digestWithSource(filePath: string): string {
  return [
    buildDigest(filePath),
    "",
    `（以上是删减过的摘要:不含工具输出,过长时中段已截断。原始记录在 ${filePath}，`,
    "JSONL 格式一行一条。摘要不够判断某个字段时，用文件工具自己去查那一段；够了就别读。）",
  ].join("\n");
}

// Big files never get inlined — pi's @path would blow the context window — so the
// digest slot carries directions instead of content. This does mean pi sees the raw
// JSONL, tool outputs included, where buildDigest would have stripped them.
function readItYourself(filePath: string): string {
  return [
    "（这份记录太大，没有内联进来。请用你的文件工具自己读。）",
    `路径：${filePath}`,
    "格式是 JSONL，一行一条事件。文件很大，分段读，不要一次全读。",
    "只看 type 为 user 和 assistant 的行；跳过 tool_result 的内容，它们又长又没用。",
    "读够判断上面那些字段就停，不必读完。",
  ].join("\n");
}

const db = new Database(DB_PATH);
try { db.exec("ALTER TABLE observations ADD COLUMN sop_candidate TEXT"); } catch {} // 存量库迁移;已有则跳过
const sessionFilter = opt("--session");
const pending = db
  .prepare(
    `SELECT s.session_id, s.file_path, s.ended_at
     FROM sessions s LEFT JOIN observations o ON o.session_id = s.session_id
     WHERE s.kind = 'main'
       AND s.source = 'claude-code' -- digest 解析器只认 Claude 式 JSONL;Cursor 的 state.vscdb(2.8GB 二进制)曾把整条管线 SIGTRAP 打死两周
       AND (?1 IS NOT NULL AND s.session_id = ?1
            OR ?1 IS NULL AND o.session_id IS NULL
               AND s.ended_at < strftime('%Y-%m-%dT%H:%M:%S', 'now', '-30 minutes')
               AND (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.session_id) >= 3
               -- 输出 token 比轮数能说明这次会话有没有干活;轮数分不出来(3 轮和 4 轮的
               -- 空规则率是 93% 对 96%)。实测 2592 条已蒸馏会话,产出候选共 1373 条:
               -- <500 token 的会话有 671 条(26%),只贡献 44 条候选(3.2%);2K 以上贡献 1244 条。
               -- 代价是明确的:那 671 条里确实有出过候选的,这道门会连它们一起挡掉,而且不留
               -- 墓碑 —— 想要哪一条,用 --session 手动重跑,上面那条分支不受这里限制。
               -- claude-code 这个源的 output_tokens 无空值(122586/122586),门槛不会误伤没记账的。
               AND (SELECT COALESCE(SUM(t.output_tokens), 0) FROM turns t WHERE t.session_id = s.session_id) >= 500)
     ORDER BY s.ended_at DESC LIMIT ?2`,
  )
  .all(sessionFilter, flag("--dry-run") ? 20 : Number(opt("--limit") ?? 50)) as
  { session_id: string; file_path: string; ended_at: string }[];

if (pending.length === 0) {
  console.log("ccobs distill: nothing pending");
  writeFileSync(join(OBS_DIR, "distill.heartbeat"), new Date().toISOString());
  process.exit(0);
}

if (flag("--dry-run")) {
  const s = pending.find((p) => existsSync(p.file_path)); // retention may have eaten the raw file
  if (!s) {
    console.log("ccobs distill: pending sessions have no raw JSONL left on disk");
    process.exit(0);
  }
  const digest = buildDigest(s.file_path);
  console.log(`# session ${s.session_id} (${s.ended_at})\n`);
  console.log(PROMPT_TPL.replace("{{TRANSCRIPT_DIGEST}}", digest));
  process.exit(0);
}

const model = resolveModel("distill");
if (!model) {
  console.log(`ccobs distill: ${llmConfigHint()}`);
  process.exit(0);
}
// retention 清掉原始 JSONL 之后，这个会话永远蒸馏不出来了。留一条墓碑把它
// 排除掉，否则每小时都要重新扫一遍，还占 LIMIT 的名额。summary 为空、
// learn_candidates 为 "[]"，recall 和 rollup 的过滤条件本来就会跳过这两种。
const tomb = db.prepare(
  `INSERT OR REPLACE INTO observations
   (session_id, distilled_at, distill_model, summary, learn_candidates)
   VALUES (?,?,'skipped:no-raw-file','','[]')`,
);
const put = db.prepare(
  `INSERT OR REPLACE INTO observations
   (session_id, distilled_at, distill_model, task_type, outcome, corrections,
    dispatch_engine, dispatch_result, summary, learn_candidates, sop_candidate)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
);

let ok = 0;
let failed = 0;
let tombed = 0;
let bigged = 0;
for (const s of pending) {
  if (!existsSync(s.file_path)) {
    tomb.run(s.session_id, new Date().toISOString());
    tombed++;
    continue;
  }
  const big = statSync(s.file_path).size > BIG_FILE;
  if (big) bigged++;
  try {
    const answer = await piCall(
      PROMPT_TPL.replace("{{TRANSCRIPT_DIGEST}}", big ? readItYourself(s.file_path) : digestWithSource(s.file_path)),
      // 两条分支都开工具:大文件是没别的办法,小文件是让它能补摘要删掉的那部分。
      // 大文件给更长的钟,它得整个文件自己翻一遍,来回好几趟。
      { model, system: JSON_ONLY, tools: READ_ONLY_TOOLS, timeoutMs: big ? 900_000 : 300_000 },
    );
    if (!answer) throw new Error("pi returned nothing");
    const j = extractJson(answer);
    if (!j.task_type || !j.outcome || j.summary == null) throw new Error("missing required fields");
    put.run(
      s.session_id, new Date().toISOString(), model,
      j.task_type, j.outcome, Number(j.corrections ?? 0),
      j.dispatch_engine ?? null, j.dispatch_result ?? null,
      String(j.summary).slice(0, 200), JSON.stringify(j.learn_candidates ?? []),
      j.sop_candidate ? String(j.sop_candidate).slice(0, 60) : null,
    );
    ok++;
  } catch (e) {
    failed++; // left undistilled; retried next run
    console.error(`  ${s.session_id}: ${e}`);
  }
}
console.log(
  `ccobs distill: ${ok} ok, ${failed} failed${tombed ? `, ${tombed} 无原始文件已标记` : ""}${bigged ? `, ${bigged} 交给 pi 自读` : ""}, model=${model}`,
);
// 心跳:跑到这一行才算活着(2026-07-22 起 SIGTRAP 死两周无人知的学费);session-replay hook 检查此文件的年龄
writeFileSync(join(OBS_DIR, "distill.heartbeat"), new Date().toISOString());
