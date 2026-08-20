#!/usr/bin/env bun
// Dispatch one vendor into its own Herdr tab: preflight -> layout -> start ->
// deliver -> wait on the report marker -> ledger row.
// Run with Bash run_in_background: true; it blocks until the marker or timeout.

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

const HELP = `bun herdr_dispatch.ts --cell <id> --model <slot> --cwd <repo> --brief <file> --report <file> [opts] -- <agent args...>

  (--model prechecks the manifest slot; the agent args after the -- separator must select it too)
  --role executor|advisor   slot role to preflight (default: executor)
  --kind <herdr kind>       herdr agent kind (default: derived from the cell's cli)
  --label <text>            tab label (default: <cell>-<basename cwd>)
  --env K=V                 env for the launched vendor process (repeatable)
  --scenario <text>         ledger scenario field
  --why econ|obs|advice     ledger why field (default: econ)
  --marker <text>           report-done marker (default: REPORT-DONE)
  --prompt <text>           override the delivered prompt
  --timeout-min <n>         give up waiting (default: 45)
  --poll-sec <n>            marker poll interval (default: 20)
  --await-commit            also require a new commit in --cwd (worktree briefs)
  --keep                    keep the tab open on pass
  --dry-run                 preflight only, print the plan, touch nothing`;

// ---------- args ----------
const argv = process.argv.slice(2);
const sepAt = argv.indexOf("--");
const flags = sepAt === -1 ? argv : argv.slice(0, sepAt);
const agentArgs = sepAt === -1 ? [] : argv.slice(sepAt + 1);
const opt: Record<string, string> = {};
const envs: string[] = [];
for (let i = 0; i < flags.length; i++) {
  const k = flags[i];
  if (!k.startsWith("--")) continue;
  const name = k.slice(2);
  if (name === "await-commit" || name === "keep" || name === "dry-run" || name === "help") { opt[name] = "1"; continue; }
  const v = flags[++i];
  if (name === "env") envs.push(v); else opt[name] = v;
}
if (opt.help || !opt.cell || !opt.model || !opt.cwd || !opt.brief || !opt.report) {
  console.log(HELP);
  process.exit(opt.help ? 0 : 2);
}

const die = (msg: string) => { console.error(`PREFLIGHT-FAIL: ${msg}`); process.exit(2); };
const sh = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  return { ok: p.exitCode === 0, out: p.stdout.toString(), err: p.stderr.toString() };
};
const herdrJson = (args: string[]) => {
  const r = sh(["herdr", ...args]);
  if (!r.ok) die(`herdr ${args.join(" ")} -> ${r.err.trim() || r.out.trim()}`);
  try { return JSON.parse(r.out); } catch { return null; }
};

// ---------- 1. preflight ----------
if (process.env.HERDR_ENV !== "1") die("not inside Herdr (HERDR_ENV != 1); use a headless launcher instead");

const ccobs = process.env.CCOBS_DIR || `${homedir()}/.claude/observability`;
const manifestPath = process.env.VENDOR_MANIFEST || `${ccobs}/vendor-manifest.json`;
if (!existsSync(manifestPath)) die(`no manifest at ${manifestPath}; bootstrap per vendor-onboarding.md`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const cell = manifest.cells?.find((c: any) => c.id === opt.cell);
if (!cell) die(`cell "${opt.cell}" not in the manifest`);
if (cell.enabled === false) die(`cell "${opt.cell}" is disabled (verdict history only)`);
if (!Bun.which(cell.cli)) die(`cli "${cell.cli}" not installed`);

const role = opt.role || "executor";
const slot = (cell.slots?.[role] || []).find((s: any) => s.model === opt.model);
if (!slot) die(`model "${opt.model}" is not a ${role} slot of cell "${opt.cell}"`);
// The wall is per model, and the manifest already knows about it — read it, don't rediscover it.
if (slot.status !== "supported") die(`slot "${opt.model}" status=${slot.status}${slot.note ? ` — ${slot.note}` : ""}`);
// --model only prechecks the manifest; the vendor CLI takes its own flag after `--`.
// Leave it out and the CLI silently runs its default model (pi -> gemini flash -> 429).
if (!agentArgs.some((a) => a.includes(opt.model))) {
  die(`--model ${opt.model} is a manifest precheck only; the agent args after \`--\` must also select it (cell launch: ${cell.launch})`);
}

const cwd = resolve(opt.cwd);
const brief = resolve(opt.brief);
const report = resolve(opt.report);
if (!existsSync(cwd)) die(`--cwd ${cwd} does not exist`);
if (!existsSync(brief)) die(`--brief ${brief} does not exist`);
if (!existsSync(dirname(report))) die(`--report dir ${dirname(report)} does not exist`);
if (existsSync(report)) die(`--report ${report} already exists; the marker wait cannot tell old from new`);

const marker = opt.marker || "REPORT-DONE";
const kind = opt.kind || ({ "cursor-agent": "cursor", claude: "claude", pi: "pi", kimi: "kimi" } as any)[cell.cli] || cell.cli;
const label = opt.label || `${opt.cell}-${cwd.split("/").pop()}`;
const timeoutMs = Number(opt["timeout-min"] || 45) * 60_000;
const pollMs = Number(opt["poll-sec"] || 20) * 1000;
const prompt = opt.prompt ||
  `Read ${brief} and execute it end-to-end. Do not commit. When finished, write your full report to ${report} and make its last line exactly: ${marker}`;
const headBefore = sh(["git", "-C", cwd, "rev-parse", "HEAD"]).out.trim();

if (opt["dry-run"]) {
  console.log(JSON.stringify({ plan: "dry-run", cell: opt.cell, model: opt.model, role, kind, label, cwd, brief, report, marker, agentArgs, envs, timeoutMin: timeoutMs / 60000 }, null, 2));
  process.exit(0);
}

// ---------- 2. layout: an exclusive tab, never a split ----------
// A split crowds the vendor's TUI into a column narrow enough to misread as hung.
const envArgs = envs.flatMap((e) => ["--env", e]);
const tab = herdrJson(["tab", "create", "--cwd", cwd, "--label", label, "--no-focus", ...envArgs]);
const paneId = tab.result.root_pane.pane_id;
const tabId = tab.result.tab.tab_id;
const abort = (msg: string) => {
  if (!opt.keep) sh(["herdr", "tab", "close", tabId]);
  console.error(msg);
  process.exit(3);
};

// ---------- 3. start ----------
// Env goes on `tab create`, not a `pane run export`: a command left in the
// pane makes `agent start` reject it as "not an available shell".
// herdr agent names: lowercase start, [a-z0-9_-], <=32 chars.
// tabId goes first: the 32-char cap must never truncate away the part that
// makes two concurrent dispatches into the same repo distinguishable.
const name = `d-${tabId}-${label}`.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
// A pane fresh out of `tab create` is not at its shell prompt yet, and
// `agent start` rejects it as "not an available shell" — retry, don't fail.
let started = { ok: false, out: "", err: "" };
for (let i = 0; i < 10 && !started.ok; i++) {
  if (i) await Bun.sleep(2000);
  started = sh(["herdr", "agent", "start", name, "--kind", kind, "--pane", paneId, "--timeout", "60000", "--", ...agentArgs]);
}
if (!started.ok) abort(`START-FAIL: ${started.err.trim() || started.out.trim()}`);

// ---------- 4. deliver, then confirm delivery from the pane ----------
// `interactive_ready` can be true while the TUI still eats keystrokes, so a
// prompt can vanish silently — resend until the pane echoes it back.
let delivered = false;
for (let i = 0; i < 3 && !delivered; i++) {
  sh(["herdr", "agent", "prompt", name, prompt]);
  delivered = sh(["herdr", "pane", "wait-output", paneId, "--match", report, "--timeout", "15000"]).ok;
}

// ---------- 5. ledger row at launch ----------
const today = new Date().toISOString().slice(0, 10);
const ledger = `${ccobs}/dispatch/ledger.md`;
const row = `${today} | ${opt.cell}/${opt.model} | ${opt.scenario || label} | why:${opt.why || "econ"} | dispatched(${paneId}) | resumes:0`;
if (!existsSync(ledger)) writeFileSync(ledger, "");
appendFileSync(ledger, `${row}\n`);
// ponytail: read-modify-write amend; fine for serial dispatches, needs flock
// or an append-only verdict line if two fanned-out wrappers finish at once.
const amend = (verdict: string) => {
  const text = readFileSync(ledger, "utf8");
  writeFileSync(ledger, text.replace(row, row.replace(/dispatched\([^)]*\)/, verdict)));
};

console.log(JSON.stringify({ launched: name, pane: paneId, tab: tabId, delivered, report }));
if (!delivered) { amend(`fail(prompt-not-echoed,${paneId})`); abort("DELIVERY-FAIL: prompt never appeared in the pane"); }

// ---------- 6. wait on the artifact, never on agent status ----------
// agent_status/`agent wait` settle on any turn boundary, including a mid-run
// question, so they return long before the deliverable exists.
const deadline = Date.now() + timeoutMs;
let done = false;
while (Date.now() < deadline) {
  await Bun.sleep(pollMs);
  if (!existsSync(report)) continue;
  if (!readFileSync(report, "utf8").includes(marker)) continue;
  if (opt["await-commit"] && sh(["git", "-C", cwd, "rev-parse", "HEAD"]).out.trim() === headBefore) continue;
  done = true;
  break;
}

if (!done) {
  amend(`fail(timeout,${paneId})`);
  console.error(`TIMEOUT: no "${marker}" in ${report} after ${timeoutMs / 60000}min; pane ${paneId} left open`);
  process.exit(4);
}
amend("pass(unverified)"); // host still runs the acceptance itself — see protocol.md §3
if (!opt.keep) sh(["herdr", "tab", "close", tabId]);
console.log(JSON.stringify({ status: "marker-seen", report, pane: paneId, tabClosed: !opt.keep, ledgerRow: row }));
