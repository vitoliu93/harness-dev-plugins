// Who runs a role tonight: walks config's model chain, probing first and switching only when the
// model itself cannot be reached. A failed verdict, a timeout or a stuck agent is a retry, not a switch.

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { extractJson, piCall } from "./pi-call.ts";
import { OBS_DIR } from "./rules-digest.ts";

const AGENTS_DIR = join(OBS_DIR, "agents");
const QUOTA = join(AGENTS_DIR, "quota.json");
const SCRIPTS = resolve(import.meta.dir, "../../use-agents/scripts");
const REPROBE_MS = 20 * 3_600_000; // a quota wall with no stated reset gets one probe a night

export type Route = { id: string; kind: string; model: string; effort?: string };
export type RoleChain = { alias: string; effort?: string }[];

const ACCESS = /\b(401|402|403|429)\b|unauthori[sz]ed|forbidden|insufficient|quota|rate.?limit|credits? (are )?depleted|balance|overloaded|ECONN|fetch failed|network error|usage limit|hit your .*limit/i;
const QUOTA_ERR = /\b402\b|insufficient|quota|credits? (are )?depleted|balance|usage limit|hit your .*limit/i;
export const isAccessError = (s: string) => ACCESS.test(s);
export const isQuotaError = (s: string) => QUOTA_ERR.test(s);

const readQuota = (): any => { try { return JSON.parse(readFileSync(QUOTA, "utf8")); } catch { return { version: 1, routes: {} }; } };
function writeQuota(q: any): void { writeFileSync(QUOTA, JSON.stringify(q, null, 2) + "\n", { mode: 0o600 }); }

/** Reset passed, or no reset stated and it has been a while: worth one probe. */
export function quotaBlocked(e: { limited_at?: string; reset_at?: string | null } | undefined, now = Date.now()): boolean {
  if (!e) return false;
  if (e.reset_at) return Date.parse(e.reset_at) > now;
  return now - Date.parse(e.limited_at ?? "") < REPROBE_MS;
}

/** Each alias's own routes (normal first), then the next alias. Pure, so the order can be tested. */
export function expandChain(chain: RoleChain, agents: any, quota: any, skip: Set<string>, now = Date.now()): Route[] {
  const out: Route[] = [];
  for (const { alias, effort } of chain) {
    const a = agents.agents?.[alias];
    if (!a) continue;
    const ordered = [...a.routes.filter((r: any) => r.use === "normal"), ...a.routes.filter((r: any) => r.use !== "normal")];
    for (const r of ordered) {
      if (skip.has(r.id) || quotaBlocked(quota.routes?.[r.id], now)) continue;
      out.push({ id: r.id, kind: r.kind, model: r.model, effort: effort ?? a.effort ?? undefined });
    }
  }
  return out;
}

function probeCmd(r: Route): string[] {
  const ask = "Reply with exactly: ok";
  return r.kind === "pi" ? ["pi", "-p", "--no-context-files", "--no-tools", "--thinking", "low", "--model", r.model, ask] : ["claude", "-p", "--model", r.model, ask];
}
async function probe(r: Route): Promise<string | null> {
  const p = Bun.spawn(probeCmd(r), { stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 60_000, killSignal: "SIGKILL" });
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  return code === 0 && /ok/i.test(o) ? null : `probe exit ${code}: ${(e || o).slice(-200) || "timeout"}`;
}

function nativeArgs(r: Route): string[] {
  if (r.kind === "pi") return ["--model", r.model, ...(r.effort ? ["--thinking", r.effort] : [])];
  return ["--model", r.model, "--permission-mode", "auto", ...(r.effort ? ["--effort", r.effort] : [])];
}

export type RunOpts = { role: string; name: string; label: string; cwd: string; promptFile: string; resultFile: string; marker: string; timeoutMin: number; chain: RoleChain; skip: Set<string>; beforeRetry?: () => void };
export type RunOutcome = { ok: boolean; route?: string; why?: string; exhausted?: boolean; switched: string[] };

const herdr = (...a: string[]) => Bun.spawnSync(["herdr", ...a], { stdout: "pipe", stderr: "pipe" });

export async function runAgent(o: RunOpts): Promise<RunOutcome> {
  const switched: string[] = [];
  const agents = JSON.parse(readFileSync(join(AGENTS_DIR, "agents.json"), "utf8"));
  // Marks a route down and says why; quota walls persist across nights, a 401 only for this run.
  const down = (r: Route, why: string) => {
    switched.push(`${r.id}: ${why.slice(0, 120)}`);
    o.skip.add(r.id);
    if (isQuotaError(why)) { const q = readQuota(); q.routes[r.id] = { limited_at: new Date().toISOString(), reset_at: null, reset_hint: "autopilot", message: why.slice(0, 300) }; writeQuota(q); }
  };
  for (;;) {
    const quota = readQuota();
    const [r] = expandChain(o.chain, agents, quota, o.skip);
    if (!r) return { ok: false, exhausted: true, why: "no reachable model left", switched };
    const bad = await probe(r);
    if (bad) { down(r, bad); continue; }
    if (quota.routes?.[r.id]) { delete quota.routes[r.id]; writeQuota(quota); }

    const launched = Bun.spawnSync(["bash", join(SCRIPTS, "launch-agent.sh"), o.name, r.kind, o.label, o.promptFile, "--", ...nativeArgs(r)], { cwd: o.cwd, stdout: "pipe", stderr: "pipe" });
    if (launched.exitCode !== 0) return { ok: false, why: `launch failed: ${launched.stderr.toString().slice(-200)}`, switched };
    const tab = JSON.parse(launched.stdout.toString().trim().split("\n").pop()!).tab_id as string;
    const wait = Bun.spawn(["bash", join(SCRIPTS, "wait-result.sh"), o.name, o.resultFile, o.marker, String(o.timeoutMin * 60)], { stdout: "pipe", stderr: "pipe" });
    const code = await wait.exited;
    const pane = herdr("agent", "read", o.name, "--lines", "25").stdout.toString();
    herdr("tab", "close", tab);
    if (code === 0) return { ok: true, route: r.id, switched };
    if (isAccessError(pane)) { down(r, pane.slice(-300)); o.beforeRetry?.(); continue; }
    return { ok: false, route: r.id, why: `wait-result exit ${code}: ${pane.slice(-200)}`, switched };
  }
}

/** Grouping and summaries: deepseek through llm.json, sonnet if that returns nothing. */
export async function cheapJson(prompt: string): Promise<any | null> {
  const system = "You return one JSON object and nothing else. No prose, no code fences.";
  try {
    const a = await piCall(prompt, { scenario: "todo", system, timeoutMs: 300_000 });
    if (a) return extractJson(a);
  } catch {}
  const p = Bun.spawn(["claude", "-p", "--model", "sonnet", `${system}\n\n${prompt}`], { stdout: "pipe", stderr: "ignore", stdin: "ignore", timeout: 300_000, killSignal: "SIGKILL", cwd: homedir() });
  const text = await new Response(p.stdout).text();
  try { return (await p.exited) === 0 ? extractJson(text) : null; } catch { return null; }
}

