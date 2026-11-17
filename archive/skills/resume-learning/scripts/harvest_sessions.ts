#!/usr/bin/env bun
/**
 * 汇总四个 CLI 在指定 cwd 的本地会话里, 自某日以来的用户 prompt, 按时间排序输出。
 *
 * 用法: harvest_sessions.ts <cwd> [--since YYYY-MM-DD]   (--since 默认今天)
 *
 * 来源:
 *   claude   ~/.claude/projects/<munged-cwd>/*.jsonl
 *   codex    ~/.codex/state_*.sqlite threads 表按 cwd 索引 rollout 文件(含 archived), 带会话标题
 *   grok     ~/.grok/sessions/<urlencode(cwd)>/prompt_history.jsonl
 *   cursor   ~/.cursor/chats/<md5(cwd)>/<session>/store.db + Cursor IDE globalStorage composer
 *
 * Python 原版 harvest_sessions.py 的逐字节兼容移植 (bun 驱动, 零三方依赖)。
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const HOME = homedir();
const MAXLEN = 240;

/** [epochMs, source, text] — 与 Python 的 (datetime, src, text) 元组对应 */
type Item = [number, string, string];

/** fromisoformat 兼容: Date 原生接受 `Z` 后缀与 `+00:00` 偏移 */
function parseTs(s: string): number {
  return new Date(s).getTime();
}

function clean(text: string): string | null {
  const t = text.trim().split(/\s+/).join(" ");
  // 跳过注入的上下文/命令包装, 只留用户亲手打的内容
  if (
    !t ||
    t.startsWith("<") ||
    t.startsWith("Caveat:") ||
    t.startsWith("# AGENTS.md") ||
    t.startsWith("Your conversation was summarized")
  ) {
    return null;
  }
  // Python 按码点切片, 用码点数组保证 astral 字符处逐字节一致
  return [...t].slice(0, MAXLEN).join("");
}

/**
 * Python urllib.parse.quote: 不编码 A-Za-z0-9_.-~ (RFC 3986 unreserved) + safe 参数。
 * encodeURIComponent 额外放行 !'()* 且总是编码 /, 在此对齐。
 */
function pyQuote(s: string, safe: string): string {
  let out = encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  if (safe.includes("/")) out = out.replace(/%2F/g, "/");
  return out;
}

/** 读取目录下直接子项名; 目录不存在时返回 null (对齐 Path.glob 的空结果) */
function listDir(dir: string): string[] | null {
  try {
    return readdirSync(dir);
  } catch {
    return null;
  }
}

function* fromClaude(cwd: string, since: number): Generator<Item> {
  const proj = join(HOME, ".claude/projects", cwd.replace(/[^A-Za-z0-9-]/g, "-"));
  const files = listDir(proj);
  if (!files) return;
  for (const name of files) {
    if (!name.endsWith(".jsonl")) continue;
    const fp = join(proj, name);
    if (statSync(fp).mtimeMs < since) continue;
    for (const line of readFileSync(fp, "utf-8").split("\n")) {
      let d: any;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      if (d?.type !== "user" || d?.isMeta) continue;
      const ts = parseTs(d.timestamp);
      if (ts < since) continue;
      let c = d.message?.content;
      if (Array.isArray(c)) {
        if (c.some((x) => x?.type === "tool_result")) continue;
        const hasImg = c.some((x) => x?.type === "image");
        c = c
          .filter((x) => x?.type === "text")
          .map((x) => x?.text ?? "")
          .join(" ");
        if (hasImg) c = "[图片] " + c;
      }
      if (typeof c === "string") {
        const t = clean(c);
        if (t) yield [ts, "claude", t];
      }
    }
  }
}

function* fromCodex(cwd: string, since: number): Generator<Item> {
  // threads 表是官方索引: cwd/title/rollout_path, 且覆盖 archived_sessions/
  const codexDir = join(HOME, ".codex");
  const names = listDir(codexDir);
  if (!names) return;
  const dbs = names.filter((n) => /^state_.*\.sqlite$/.test(n)).sort();
  if (dbs.length === 0) return;
  const con = new Database(join(codexDir, dbs[dbs.length - 1]), { readonly: true });
  const rows = con
    .query(
      "select rollout_path, title, updated_at_ms from threads" +
        " where cwd=? and updated_at_ms>=?",
    )
    .values(cwd, since) as [string, string, number][];
  con.close();
  // threads.title 只是首条用户消息, 与 prompt 输出重复, 不单独输出
  for (const [path] of rows) {
    if (!existsSync(path)) continue;
    const seen = new Set<string>();
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      let d: any;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      const p = d?.payload ?? {};
      let text: string | null = null;
      if (d?.type === "event_msg" && p?.type === "user_message") {
        text = p.message ?? "";
      } else if (d?.type === "response_item" && p?.role === "user") {
        text = (p.content ?? [])
          .filter((x: any) => x?.type === "input_text")
          .map((x: any) => x?.text ?? "")
          .join(" ");
      }
      if (text) {
        const t = clean(text);
        // seen 去重在 ts 过滤之前, 与原版顺序一致
        if (t && !seen.has(t)) {
          seen.add(t);
          const ts = parseTs(d.timestamp);
          if (ts >= since) yield [ts, "codex", t];
        }
      }
    }
  }
}

function* fromGrok(cwd: string, since: number): Generator<Item> {
  const root = join(HOME, ".grok/sessions", pyQuote(cwd, ""));
  // session_summary 是"agent 做了什么"的现成蒸馏
  const entries = listDir(root) ?? [];
  for (const e of entries) {
    const sj = join(root, e, "summary.json");
    if (!existsSync(sj)) continue;
    let d: any;
    try {
      d = JSON.parse(readFileSync(sj, "utf-8"));
    } catch {
      continue;
    }
    const ts = parseTs(d.last_active_at);
    if (ts >= since) {
      const t = clean(d.session_summary ?? "");
      if (t) yield [ts, "grok:摘要", t];
    }
  }
  const f = join(root, "prompt_history.jsonl");
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, "utf-8").split("\n")) {
    let d: any;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (d?.is_bash) continue;
    const ts = parseTs(d.timestamp);
    if (ts >= since) {
      const t = clean(d.prompt ?? "");
      if (t) yield [ts, "grok", t];
    }
  }
}

const utf8Fatal = new TextDecoder("utf-8", { fatal: true });

function* fromCursorCli(cwd: string, since: number): Generator<Item> {
  const root = join(
    HOME,
    ".cursor/chats",
    createHash("md5").update(cwd, "utf-8").digest("hex"),
  );
  const entries = listDir(root);
  if (!entries) return;
  for (const e of entries) {
    const db = join(root, e, "store.db");
    if (!existsSync(db)) continue;
    const mtime = statSync(db).mtimeMs;
    if (mtime < since) continue;
    let rows: any[];
    try {
      const con = new Database(db, { readonly: true });
      rows = con.query("select data from blobs").values();
      con.close();
    } catch {
      continue;
    }
    for (const [blob] of rows) {
      let d: any;
      try {
        // blob 列给 Uint8Array, text 列给 string; 非法 utf-8 对齐 UnicodeDecodeError 跳过
        d = JSON.parse(typeof blob === "string" ? blob : utf8Fatal.decode(blob));
      } catch {
        continue;
      }
      if (d?.role !== "user") continue;
      let c = d.content;
      if (Array.isArray(c)) {
        c = c
          .filter((x) => x?.type === "text")
          .map((x) => x?.text ?? "")
          .join(" ");
      }
      if (typeof c === "string") {
        const t = clean(c);
        // ponytail: blob 无逐条时间戳, 借 session 文件 mtime
        if (t) yield [mtime, "cursor", t];
      }
    }
  }
}

function* fromCursorIde(cwd: string, since: number): Generator<Item> {
  const wsRoot = join(HOME, "Library/Application Support/Cursor/User/workspaceStorage");
  const gdbPath = join(
    HOME,
    "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
  );
  if (!existsSync(gdbPath)) return;
  const uri = "file://" + pyQuote(cwd, "/");
  const wsIds: string[] = [];
  for (const e of listDir(wsRoot) ?? []) {
    const wj = join(wsRoot, e, "workspace.json");
    if (!existsSync(wj)) continue;
    // 原版此处 json.loads 不加保护, 坏文件直接崩 —— 保持一致
    const d = JSON.parse(readFileSync(wj, "utf-8"));
    if (d?.folder === uri) wsIds.push(e);
  }
  if (wsIds.length === 0) return;
  const con = new Database(gdbPath, { readonly: true });
  const compIds: string[] = [];
  for (const ws of wsIds) {
    const rows = con
      .query("select composerId from composerHeaders where workspaceId=?")
      .values(ws) as [string][];
    for (const [cid] of rows) compIds.push(cid);
  }
  for (const cid of compIds) {
    const row = con
      .query("select value from cursorDiskKV where key=?")
      .get(`composerData:${cid}`) as { value: string } | undefined;
    if (!row) continue;
    const cd = JSON.parse(row.value);
    const upd = cd?.lastUpdatedAt;
    if (upd && cd?.name) {
      const ts = upd; // fromtimestamp(upd/1000) 的 epoch ms 即 upd 本身
      if (ts >= since) {
        const t = clean(cd.name);
        if (t) yield [ts, "cursor-ide:标题", t];
      }
    }
    for (const h of cd?.fullConversationHeadersOnly ?? []) {
      if (h?.type !== 1 || !("createdAt" in h)) continue;
      const ts = parseTs(h.createdAt);
      if (ts < since) continue;
      const brow = con
        .query("select value from cursorDiskKV where key=?")
        .get(`bubbleId:${cid}:${h.bubbleId}`) as { value: string } | undefined;
      if (!brow) continue;
      const b = JSON.parse(brow.value);
      let text: string = b?.text ?? "";
      if (b?.images && !text) text = "[图片]";
      const t = clean(text);
      if (t) yield [ts, "cursor-ide", t];
    }
  }
  con.close();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** datetime.now().strftime("%Y-%m-%d") — 本地日期 */
function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

/** fromisoformat(s).astimezone(): 朴素日期按本地时区解释 */
function parseSince(s: string): number {
  return new Date(s.length === 10 ? `${s}T00:00:00` : s).getTime();
}

function usage(): never {
  process.stderr.write("usage: harvest_sessions.ts [-h] [--since SINCE] cwd\n");
  process.exit(2);
}

function main(): void {
  const argv = process.argv.slice(2);
  let cwdArg: string | undefined;
  let sinceStr = localToday();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") {
      if (i + 1 >= argv.length) usage();
      sinceStr = argv[++i];
    } else if (a.startsWith("--since=")) {
      sinceStr = a.slice("--since=".length);
    } else if (a === "-h" || a === "--help") {
      process.stdout.write("usage: harvest_sessions.ts [-h] [--since SINCE] cwd\n");
      process.exit(0);
    } else if (!a.startsWith("-") && cwdArg === undefined) {
      cwdArg = a;
    } else {
      usage();
    }
  }
  if (cwdArg === undefined) usage();
  const cwd = cwdArg.replace(/\/+$/, "");
  const since = parseSince(sinceStr);

  const items: Item[] = [];
  for (const src of [fromClaude, fromCodex, fromGrok, fromCursorCli, fromCursorIde]) {
    items.push(...src(cwd, since));
  }
  // Array.prototype.sort 与 Python sort 同为稳定排序
  items.sort((a, b) => a[0] - b[0]);

  if (items.length === 0) {
    console.log(`(自 ${sinceStr} 起, 四个 CLI 在 ${cwd} 下均无用户对话记录)`);
    return;
  }
  for (const [ts, src, text] of items) {
    const d = new Date(ts);
    const local = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    console.log(`${local} [${src}] ${text}`);
  }
}

main();
