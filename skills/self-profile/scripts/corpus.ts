#!/usr/bin/env bun
// Build the self-profile corpus: the user's own typed messages, sliced by time, plus stats.json.
// Usage: bun corpus.ts [--out <dir>] [--since YYYY-MM-DD] [--slice-chars 180000] [--tz-hours N]
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";

const arg = (k: string) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
const CFG = process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME!, ".claude");
const OUT = arg("out") || process.env.SELF_PROFILE_DIR || join(CFG, "usage-data/self-profile");
const SLICE = Number(arg("slice-chars") || 180000);
const TZ = Number(arg("tz-hours") ?? -new Date().getTimezoneOffset() / 60);
const local = (ts: number | string) => new Date(new Date(ts).getTime() + TZ * 3600e3).toISOString().replace("T", " ").slice(0, 16);
const today = local(Date.now()).slice(0, 10);
const prevRun = existsSync(OUT) ? readdirSync(OUT).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today).sort().pop() : undefined;
const since = arg("since") || prevRun || local(Date.now() - 35 * 864e5).slice(0, 10);
const RUN = join(OUT, today);

// A session whose first message is a task card was driven by another agent, not typed by the user.
const cardRe = /^(读取? ?[\/~]|读 |Read \/|你是.{0,16}(审查|顾问|导演|开发|测试|研究|审核|程序|验收|评审)|You are (the|an?) .{0,24}(reviewer|advisor|tester|developer)|\[paste \d+: ?\s*(你是|You are)|Reply with exactly)/;
const autoRe = /^(Background \(from the session|<cross-session-message|I hit my usage limit|Host (update|ruling)|\[task-notification\])/;
const mask = (s: string) => s
  .replace(/\b(sk-[A-Za-z0-9_-]{16,}|AK(LT|ID|IA)[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,})/g, "[masked]")
  .replace(/[A-Za-z0-9_\-+=]{32,}/g, "[masked]");
const clean = (s: string) => mask(s
  .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
  .replace(/<local-command-(stdout|stderr|caveat)>[\s\S]*?<\/local-command-\1>/g, "")
  .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, "[task-notification]")
  .replace(/<side-sessions-event>[\s\S]*?<\/side-sessions-event>/g, "")
  .replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
  .replace(/<command-name>([\s\S]*?)<\/command-name>/g, "$1 ")
  .replace(/<command-args>([\s\S]*?)<\/command-args>/g, "$1")
  .replace(/<pasted_content[^>]*>([\s\S]*?)<\/pasted_content>/g, (_, b) => `[paste ${b.length}: ${b.slice(0, 200)}…]`)
  .replace(/\n{3,}/g, "\n\n").trim());
const cut = (s: string, n: number) => s.length > n ? s.slice(0, Math.floor(n * .75)) + ` …[${s.length - n} cut]… ` + s.slice(-Math.floor(n * .2)) : s;

type Msg = { ts: string; proj: string; sid: string; ep?: string; origin?: string; pm?: string; img: number; text: string; prev: string };

// 1. Transcripts: every top-level session file touched since the window start.
const sessions: Record<string, Msg[]> = {};
const root = join(CFG, "projects");
for (const p of existsSync(root) ? readdirSync(root) : []) {
  let files: string[]; try { files = readdirSync(join(root, p)).filter(f => f.endsWith(".jsonl")); } catch { continue; }
  for (const f of files) {
    const path = join(root, p, f);
    if (local(statSync(path).mtimeMs).slice(0, 10) < since) continue;
    let prev = "";
    for await (const l of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
      const isUser = l.includes('"type":"user"');
      if (!isUser && !l.includes('"type":"assistant"')) continue;
      let o: any; try { o = JSON.parse(l); } catch { continue; }
      if (o.isSidechain) continue;
      const c = o.message?.content;
      if (o.type === "assistant") {
        if (Array.isArray(c)) { const t = c.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim(); if (t) prev = t; }
        continue;
      }
      if (o.type !== "user" || o.isMeta || o.isCompactSummary || !o.timestamp) continue;
      let text = "", img = 0;
      if (typeof c === "string") text = c;
      else if (Array.isArray(c)) {
        if (c.some((b: any) => b.type === "tool_result")) continue;
        text = c.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
        img = c.filter((b: any) => b.type === "image").length;
      }
      text = clean(text); if (!text && !img) continue;
      (sessions[p + "/" + f] ??= []).push({ ts: o.timestamp, proj: p, sid: (o.sessionId || f).slice(0, 8), ep: o.entrypoint, origin: o.origin?.kind ?? o.origin, pm: o.permissionMode, img, text, prev: mask(prev.slice(-300)) });
      prev = "";
    }
  }
}

// 2. Keep what the user typed; drop worker sessions, notifications, and fork duplicates.
const human: Msg[] = []; const seen = new Set<string>();
let workerSessions = 0, humanSessions = 0;
for (const rs of Object.values(sessions)) {
  rs.sort((a, b) => a.ts < b.ts ? -1 : 1);
  const first = rs.find(r => r.origin !== "task-notification" && !r.text.startsWith("[Request"));
  if (!first) continue;
  if (rs[0].ep === "sdk-cli" || cardRe.test(first.text) || /^-?private-tmp|scratch-workspaces/.test(rs[0].proj)) { workerSessions++; continue; }
  let n = 0;
  for (const r of rs) {
    if (local(r.ts).slice(0, 10) < since || r.origin === "task-notification" || r.text === "[task-notification]") continue;
    if (autoRe.test(r.text) || (cardRe.test(r.text) && r.text.length > 300)) continue;
    const k = local(r.ts) + "|" + r.text.slice(0, 200); if (seen.has(k)) continue; seen.add(k);
    human.push(r); n++;
  }
  if (n) humanSessions++;
}
human.sort((a, b) => a.ts < b.ts ? -1 : 1);

// 3. Slices: equal character mass, cut on day boundaries; slice-1 is oldest.
mkdirSync(RUN, { recursive: true }); // a same-day rerun replaces the corpus and keeps notes/ and profile.html
for (const d of readdirSync(RUN)) if (/^(slice-\d+|history)$/.test(d)) rmSync(join(RUN, d), { recursive: true, force: true });
function writeParts(dir: string, head: string, lines: string[]) {
  mkdirSync(join(RUN, dir), { recursive: true });
  let buf = head + "\n", part = 1, total = 0;
  const flush = () => { writeFileSync(join(RUN, dir, `part-${String(part).padStart(2, "0")}.md`), buf); total += buf.length; part++; buf = ""; };
  for (const l of lines) { if (buf.length + l.length > 20000) flush(); buf += l + "\n"; }
  if (buf) flush();
  return { dir, parts: part - 1, chars: total };
}
const render = (r: Msg) => `[${local(r.ts).slice(5)}]${r.img ? ` [image×${r.img}]` : ""}${r.prev && r.text.length < 400 ? `\n  ↳assistant ended with: ${r.prev.slice(-160).replace(/\n+/g, " ")}` : ""}\n${cut(r.text, 800)}`;
const slices: { dir: string; parts: number; chars: number; from: string; to: string }[] = [];
if (human.length) {
  const dayMass: Record<string, number> = {};
  for (const r of human) { const d = local(r.ts).slice(0, 10); dayMass[d] = (dayMass[d] || 0) + render(r).length + 60; }
  const days = Object.keys(dayMass).sort(), total = days.reduce((a, d) => a + dayMass[d], 0), n = Math.max(1, Math.ceil(total / SLICE));
  const cuts = [days[0]]; let acc = 0;
  for (const [i, d] of days.entries()) { acc += dayMass[d]; if (acc >= total * cuts.length / n && cuts.length < n && days[i + 1]) cuts.push(days[i + 1]); }
  cuts.push("9999");
  for (let i = 0; i < cuts.length - 1; i++) {
    const rs = human.filter(r => local(r.ts).slice(0, 10) >= cuts[i] && local(r.ts).slice(0, 10) < cuts[i + 1]);
    const lines: string[] = []; let last = "";
    for (const r of rs) {
      if (r.proj + r.sid !== last) { lines.push(`\n## ${local(r.ts).slice(0, 10)} session ${r.sid} | ${r.proj.slice(-60)} | ${r.ep === "cli" ? "terminal" : r.ep || "?"}`); last = r.proj + r.sid; }
      lines.push(render(r));
    }
    const to = local(rs[rs.length - 1].ts).slice(0, 10);
    slices.push({ ...writeParts(`slice-${i + 1}`, `# slice-${i + 1}: ${cuts[i]} to ${to}. ${rs.length} messages the user typed (local time, UTC${TZ >= 0 ? "+" : ""}${TZ}). "↳" is the tail of the assistant reply being answered. "[Request interrupted…]" means the user pressed interrupt.`, lines), from: cuts[i], to });
  }
}

// 4. Input history: covers days before the oldest kept transcript, and feeds the monthly series.
type Hist = { display: string; timestamp: number; project?: string };
const histPath = join(CFG, "history.jsonl"); const hseen = new Set<string>();
const hist: Hist[] = (existsSync(histPath) ? readFileSync(histPath, "utf8").split("\n") : [])
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter((r): r is Hist => !!r && typeof r.display === "string" && !!r.timestamp)
  .filter(r => { const k = r.display + "|" + Math.floor(r.timestamp / 5000); if (hseen.has(k)) return false; hseen.add(k); return true; });
const firstTranscriptDay = human.length ? local(human[0].ts).slice(0, 10) : today;
const older = hist.filter(r => local(r.timestamp).slice(0, 10) >= since && local(r.timestamp).slice(0, 10) < firstTranscriptDay && !/^\/\S+\s*$/.test(r.display) && r.display.trim().length >= 4 && !cardRe.test(r.display));
let history: { dir: string; parts: number; chars: number; kept: number; of: number } | undefined;
if (older.length) {
  let items = older.map(r => ({ long: r.display.length >= 30, s: `[${local(r.timestamp)}] (${(r.project || "").slice(-40)}) ${cut(mask(r.display), 600)}` }));
  const size = (xs: typeof items) => xs.reduce((a, x) => a + x.s.length + 1, 0);
  if (size(items) > SLICE) { // over budget: long messages first, then an even sample
    const long = items.filter(x => x.long), step = Math.max(1, Math.ceil(size(long) / SLICE));
    items = size(long) <= SLICE ? long : long.filter((_, i) => i % step === 0);
  }
  history = { ...writeParts("history", `# history: terminal input from ${since} to ${firstTranscriptDay}, user side only. Kept ${items.length} of ${older.length}${items.length < older.length ? " (sampled, long messages first; scale counts accordingly)" : ""}.`, items.map(x => x.s)), kept: items.length, of: older.length };
}

// 5. stats.json: the numbers behind the charts.
const median = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hourly = Array(24).fill(0), weekday = Array(7).fill(0);
const perDay: Record<string, { n: number; first: number; last: number }> = {};
const hourSessions: Record<string, Set<string>> = {}, weekly: Record<string, { messages: number; interrupts: number }> = {};
const count = (m: Record<string, number>, k: string) => { m[k] = (m[k] || 0) + 1; };
const client: Record<string, number> = {}, permissionMode: Record<string, number> = {}, projects: Record<string, number> = {};
let interrupts = 0; const lengths: number[] = [];
for (const r of human) {
  const t = local(r.ts), d = t.slice(0, 10), h = Number(t.slice(11, 13)), min = h * 60 + Number(t.slice(14, 16));
  const interrupted = r.text.startsWith("[Request interrupted");
  const dow = new Date(d + "T00:00:00Z").getUTCDay(), wk = new Date(Date.parse(d) - ((dow + 6) % 7) * 864e5).toISOString().slice(0, 10);
  (weekly[wk] ??= { messages: 0, interrupts: 0 })[interrupted ? "interrupts" : "messages"]++;
  if (interrupted) { interrupts++; continue; }
  hourly[h]++; weekday[dow]++; lengths.push(r.text.length);
  const pd = perDay[d] ??= { n: 0, first: min, last: min }; pd.n++; pd.first = Math.min(pd.first, min); pd.last = Math.max(pd.last, min);
  (hourSessions[t.slice(0, 13)] ??= new Set()).add(r.proj + r.sid);
  count(client, r.ep || "unknown"); count(permissionMode, r.pm || "unknown"); count(projects, r.proj);
}
const activeDays = Object.keys(perDay).sort();
let longestStreak = 0, run = 0, prevDay = "";
for (const d of activeDays) { run = prevDay && Date.parse(d) - Date.parse(prevDay) === 864e5 ? run + 1 : 1; longestStreak = Math.max(longestStreak, run); prevDay = d; }
const windowDays = Math.round((Date.parse(today) - Date.parse(since)) / 864e5) + 1;
const hs = Object.values(hourSessions).map(s => s.size);
const monthly: Record<string, { messages: number; days: Set<string> }> = {};
for (const r of hist) { const d = local(r.timestamp).slice(0, 10); const m = monthly[d.slice(0, 7)] ??= { messages: 0, days: new Set() }; m.messages++; m.days.add(d); }
const top = (m: Record<string, number>, n: number) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, messages]) => ({ name, messages }));

let ledger: any = null; // optional: the ccobs ledger adds corrections, outcomes, and skill use
const db = join(process.env.CCOBS_DIR || join(CFG, "observability"), "obs.db");
if (existsSync(db)) try {
  const { Database } = await import("bun:sqlite"); const q = new Database(db, { readonly: true });
  ledger = {
    byMonth: q.query("select substr(s.started_at,1,7) month, count(*) sessions, round(avg(o.corrections),2) corrections, round(avg(o.outcome='partial'),3) partial from observations o join sessions s using(session_id) group by 1 order by 1").all(),
    byTaskType: q.query("select o.task_type, count(*) sessions, round(avg(o.corrections),2) corrections from observations o join sessions s using(session_id) where s.started_at >= ? group by 1 order by 2 desc").all(since),
    skills: q.query("select skill, count(*) calls, max(ts) last_used from tool_calls where tool in ('Skill','SlashCommand') and skill is not null group by 1 order by 2 desc limit 40").all(),
  };
} catch (e) { ledger = { error: String(e) }; }
let settings: any = null;
try { const s = JSON.parse(readFileSync(join(CFG, "settings.json"), "utf8")); settings = { defaultMode: s.permissions?.defaultMode ?? null, allow: (s.permissions?.allow || []).length, deny: (s.permissions?.deny || []).length }; } catch {}

const stats = {
  window: { since, until: today, days: windowDays, previousRun: prevRun ?? null, tzHours: TZ },
  messages: lengths.length, interrupts, humanSessions, workerSessions,
  activeDays: activeDays.length, blankDays: Math.max(0, windowDays - activeDays.length), longestStreak,
  perDayMedian: median(Object.values(perDay).map(d => d.n)),
  firstMessageMedian: hhmm(median(Object.values(perDay).map(d => d.first))), lastMessageMedian: hhmm(median(Object.values(perDay).map(d => d.last))),
  hourly, weekday, weekly: Object.entries(weekly).sort().map(([week, v]) => ({ week, ...v })),
  parallel: { sessionsPerActiveHour: hs.length ? +(hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(2) : 0, hoursWith3Plus: hs.length ? +(hs.filter(n => n >= 3).length / hs.length).toFixed(3) : 0 },
  length: { median: median(lengths), p90: [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length * .9)] ?? 0, tenCharsOrLess: lengths.length ? +(lengths.filter(n => n <= 10).length / lengths.length).toFixed(3) : 0 },
  client, permissionMode, projects: top(projects, 15),
  monthlyTerminalInput: Object.entries(monthly).sort().map(([month, v]) => ({ month, messages: v.messages, activeDays: v.days.size })),
  ledger, settings,
};
writeFileSync(join(RUN, "stats.json"), JSON.stringify(stats, null, 1));
console.log(JSON.stringify({ run: RUN, since, previousRun: prevRun ?? null, messages: stats.messages, slices, history: history ?? null }, null, 1));
