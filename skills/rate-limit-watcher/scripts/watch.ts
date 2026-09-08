// Forest ranger: watch Herdr agents for rate-limit walls and act.
// 5-hour wall  → wait for reset, then send "继续".
// weekly wall  → print a handoff event and exit 2 so the caller finds another agent.
// Usage: bun watch.ts [--agents a,b] [--interval 600] [--grace 120] [--once]

const KINDS = new Set(["claude", "codex"]);
const LIMIT_RE = /hit your (usage |session |weekly )?limit|usage limit reached|limit reached/i;
const WEEKLY_RE = /week/i;
const CONTINUE = "继续";

export type Wall = { kind: "weekly"; text: string } | { kind: "short"; resetAt: Date | null; text: string };

export function detectWall(screen: string, now = new Date()): Wall | null {
  const m = screen.match(LIMIT_RE);
  if (!m) return null;
  const tail = screen.slice(Math.max(0, m.index! - 200), m.index! + 300);
  const text = screen.slice(m.index!, m.index! + 200).split("\n")[0].trim();
  if (WEEKLY_RE.test(tail)) return { kind: "weekly", text };
  const resetAt = parseReset(tail, now);
  // A reset more than a day away cannot be waited out; hand off instead.
  if (resetAt && resetAt.getTime() - now.getTime() > 24 * 3600_000) return { kind: "weekly", text };
  return { kind: "short", resetAt, text };
}

// "resets 3am" / "resets 7pm (Asia/Shanghai)" / "resets at 3:30pm" / "Try again at 3:00 PM"
// "in 2 hours 15 minutes" / "resets 2026-08-08 00:00 UTC"
// ponytail: a timezone in parens is assumed to equal local time; add tz math if that ever bites.
export function parseReset(text: string, now = new Date()): Date | null {
  const iso = text.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})\s*(UTC|Z)?/);
  if (iso) return new Date(iso[1].replace(" ", "T") + (iso[2] ? "Z" : ""));
  // "Sep 9th, 2026 1:01 AM"
  const long = text.match(/([A-Z][a-z]{2})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (long) {
    let h = +long[4] % 12;
    if (long[6].toUpperCase() === "PM") h += 12;
    const d = new Date(`${long[1]} ${long[2]}, ${long[3]} 00:00:00`);
    d.setHours(h, +long[5], 0, 0);
    return d;
  }
  const rel = text.match(/\bin\s+(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i);
  if (rel && (rel[1] || rel[2])) {
    return new Date(now.getTime() + (+(rel[1] ?? 0) * 60 + +(rel[2] ?? 0)) * 60_000);
  }
  const clock = text.match(/(?:resets?|again)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!clock) return null;
  let h = +clock[1] % 12;
  if (clock[3].toLowerCase() === "pm") h += 12;
  const d = new Date(now);
  d.setHours(h, +(clock[2] ?? 0), 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

async function herdr(...args: string[]): Promise<string> {
  const p = Bun.spawn(["herdr", ...args], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out;
}

async function listAgents(only: Set<string> | null) {
  const j = JSON.parse(await herdr("agent", "list"));
  return (j.result.agents as any[])
    .filter((a) => a.name && KINDS.has(a.agent))
    .filter((a) => !only || only.has(a.name))
    .map((a) => ({ name: a.name as string, kind: a.agent as string, session: a.agent_session?.value as string, cwd: a.cwd as string }));
}

async function nudge(name: string) {
  await herdr("agent", "prompt", name, CONTINUE);
  await herdr("agent", "send-keys", name, "Enter");
}

function log(ev: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...ev }));
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const only = opt("--agents") ? new Set(opt("--agents")!.split(",")) : null;
  const interval = +(opt("--interval") ?? 600) * 1000;
  const grace = +(opt("--grace") ?? 120) * 1000;
  const once = argv.includes("--once");
  const waiting = new Map<string, Date>(); // agent → when to nudge
  const nudgedOn = new Map<string, string>(); // agent → wall text we already answered

  for (;;) {
    const now = new Date();
    const weekly: object[] = [];
    for (const a of await listAgents(only)) {
      const screen = await herdr("agent", "read", a.name, "--source", "recent-unwrapped", "--lines", "40");
      const wall = detectWall(screen, now);
      if (!wall) { waiting.delete(a.name); nudgedOn.delete(a.name); continue; }
      // The old wall line stays on screen after a nudge; only a new message counts.
      if (nudgedOn.get(a.name) === wall.text) continue;
      if (wall.kind === "weekly") { weekly.push({ agent: a.name, kind: a.kind, cwd: a.cwd, session: a.session }); continue; }
      const due = waiting.get(a.name) ?? new Date((wall.resetAt ?? new Date(now.getTime() + 30 * 60_000)).getTime() + grace);
      if (!waiting.has(a.name)) { waiting.set(a.name, due); log({ event: "short_limit", agent: a.name, nudge_at: due.toISOString() }); }
      if (now >= due) {
        await nudge(a.name);
        waiting.delete(a.name);
        nudgedOn.set(a.name, wall.text);
        log({ event: "nudged", agent: a.name });
      }
    }
    // Agents share one subscription, so several hit the weekly wall together; report them all at once.
    if (weekly.length) { log({ event: "weekly_limit", agents: weekly, action: "handoff" }); process.exit(2); }
    if (once) break;
    await Bun.sleep(interval);
  }
}

if (import.meta.main) main();
