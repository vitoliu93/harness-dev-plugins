#!/usr/bin/env bun
// Daily review of the todo ledger, last link of the hourly launchd chain; a stamp
// file keeps it to one run per day, after REVIEW_HOUR local time.
//
//   1. expire items open longer than STALE_DAYS (superseded, closed_by stale)
//   2. ask the cheap model (llm.json "todo", else default) to merge duplicates,
//      close items that recent sessions resolved, and pick the top 3 with a next step
//   3. push one Feishu message; recipient lives in ${OBS_DIR}/todo.json:
//        {"lark_user_id": "ou_xxx", "as": "bot"}
//      no file → the message only lands in ${OBS_DIR}/todo-review.md
//
// Every close is automatic and reversible (`todo.ts reopen <id>`); the message lists them.
//
//   bun todo-review.ts            # respects the daily stamp
//   bun todo-review.ts --force    # run now
//   bun todo-review.ts --dry-run  # print the message, change and send nothing

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractJson, piCall } from "./pi-call.ts";
import { OBS_DIR } from "./rules-digest.ts";
import { closeTodo, openDb } from "./todo.ts";

const STAMP = join(OBS_DIR, "todo-review.stamp");
const REVIEW_HOUR = 9;
const STALE_DAYS = 30;
const RECENT_DAYS = 3;
const JSON_ONLY = "You return one JSON object and nothing else. No prose, no code fences.";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const today = new Date().toLocaleDateString("sv"); // local YYYY-MM-DD
if (!args.includes("--force") && !dry) {
  if (new Date().getHours() < REVIEW_HOUR || (existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === today)) process.exit(0);
}

const db = openDb();
const short = (p: string | null) => (p ?? "").replace(/^\/Users\/[^/]+\//, "~/");
type Row = { id: string; title: string; why: string | null; evidence: string | null; project: string | null; created_at: string };
const open = () => db.query(`SELECT id, title, why, evidence, project, created_at FROM todos WHERE status = 'open' ORDER BY created_at`).all() as Row[];

const closed: { id: string; title: string; how: string }[] = [];
const stale = Date.now() - STALE_DAYS * 86_400_000;
for (const r of open()) {
  if (Date.parse(r.created_at) < stale && (dry || closeTodo(db, r.id, "superseded", `stale:${STALE_DAYS}d`))) closed.push({ id: r.id, title: r.title, how: `超过 ${STALE_DAYS} 天` });
}

const rows = open().slice(-80);
let top: { id: string; next: string }[] = [];
if (rows.length) {
  const recent = db.query(
    `SELECT o.session_id, s.cwd, o.summary, o.conclusion FROM observations o JOIN sessions s USING(session_id)
     WHERE s.ended_at >= ? AND o.summary != '' ORDER BY s.ended_at DESC LIMIT 120`,
  ).all(new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString()) as any[];
  const prompt = [
    "你在整理一个人的未完成事项账本。输出一个 JSON：",
    '{"merge": [{"keep": "<id>", "drop": ["<id>"]}], "resolved": [{"id": "<id>", "session": "<session_id>", "evidence": "<依据>"}], "top": [{"id": "<id>", "next": "<建议的下一步，一句话>"}]}',
    "- merge：说的是同一件事的条目，留信息最全的那条。",
    "- resolved：最近会话的摘要或结论明确表明已解决的条目。要能指出是哪个会话；只是相关、不确定，就不写。",
    "- top：剩下的条目里最值得先推进的 3 条：影响大、阻塞别的事、或拖得久的优先。",
    "",
    "未完成事项（id | 项目 | 标题 | 为什么 | 证据 | 记录日期）：",
    ...rows.map((r) => [r.id, short(r.project), r.title, r.why ?? "", r.evidence ?? "", r.created_at.slice(0, 10)].join(" | ")),
    "",
    `最近 ${RECENT_DAYS} 天的会话（session_id | 项目 | 摘要 | 结论）：`,
    ...recent.map((o) => [o.session_id, short(o.cwd), o.summary, o.conclusion ?? ""].join(" | ")),
  ].join("\n");
  try {
    const answer = await piCall(prompt, { scenario: "todo", system: JSON_ONLY, timeoutMs: 300_000 });
    const j = answer ? extractJson(answer) : {};
    const ids = new Set(rows.map((r) => r.id));
    const title = new Map(rows.map((r) => [r.id, r.title]));
    for (const m of Array.isArray(j.merge) ? j.merge : []) {
      if (!ids.has(m?.keep)) continue;
      for (const d of Array.isArray(m.drop) ? m.drop : []) {
        if (d !== m.keep && ids.has(d) && (dry || closeTodo(db, d, "superseded", `merge:${m.keep}`))) { closed.push({ id: d, title: title.get(d)!, how: `并入 ${m.keep}` }); ids.delete(d); }
      }
    }
    for (const r of Array.isArray(j.resolved) ? j.resolved : []) {
      if (ids.has(r?.id) && (dry || closeTodo(db, r.id, "done", `auto:${r.session ?? "review"}${r.evidence ? `:${String(r.evidence).slice(0, 120)}` : ""}`))) { closed.push({ id: r.id, title: title.get(r.id)!, how: `已解决（${String(r.evidence ?? r.session ?? "").slice(0, 40)}）` }); ids.delete(r.id); }
    }
    top = (Array.isArray(j.top) ? j.top : []).filter((t: any) => ids.has(t?.id)).slice(0, 3).map((t: any) => ({ id: t.id, next: String(t.next ?? "") }));
  } catch (e) {
    console.error(`todo-review: model step skipped: ${e}`);
  }
}

const gone = new Set(closed.map((c) => c.id));
const left = open().filter((r) => !gone.has(r.id)); // dry-run closes nothing in the db
const byId = new Map(left.map((r) => [r.id, r]));
const lines = [`**未完成事项 ${today}**：还开着 ${left.length} 条`];
if (top.length) {
  lines.push("", "**先推进这 3 条**");
  for (const t of top) { const r = byId.get(t.id)!; lines.push(`- ${r.title}（${short(r.project)}，${t.id}）`, `  下一步：${t.next}`); }
}
if (closed.length) {
  lines.push("", `**自动关闭 ${closed.length} 条**（判断错了：\`bun todo.ts reopen <id>\`）`);
  for (const c of closed) lines.push(`- ${c.title}：${c.how}（${c.id}）`);
}
const message = lines.join("\n");

if (dry) { console.log(message); process.exit(0); }
writeFileSync(join(OBS_DIR, "todo-review.md"), message + "\n");
writeFileSync(STAMP, today);
if (!left.length && !closed.length) process.exit(0); // nothing worth a ping
const cfgPath = join(OBS_DIR, "todo.json");
if (!existsSync(cfgPath)) { console.log(`todo-review: no ${cfgPath}, message saved to todo-review.md only`); process.exit(0); }
const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as { lark_user_id?: string; as?: string };
if (!cfg.lark_user_id) process.exit(0);
const send = Bun.spawnSync(["lark-cli", "im", "+messages-send", "--as", cfg.as ?? "bot", "--user-id", cfg.lark_user_id, "--markdown", message]);
console.log(send.exitCode === 0 ? "todo-review: sent" : `todo-review: send failed: ${send.stderr.toString().slice(0, 300)}`);
