#!/usr/bin/env bun
// One hermetic pi headless call, for hooks that need a cheap model on the
// critical path. Never throws: every failure returns null so the caller can
// stay silent — a hook must not block the user from talking.
//
// Four failure modes are all treated the same, and an exit code alone catches
// only the first:
//   1. non-zero exit
//   2. the event stream finished with no non-empty text (the FIRST agent_end
//      can carry an empty content array; the answer is in the last one)
//   3. wall clock cap — pi has no --timeout, so the child is killed here
//   4. retries exhausted (pi retries the same model 3x on 429 by itself)
//
// pi has no model-level fallback: `openRouterRouting.allow_fallbacks` swaps the
// upstream provider inside one model, not the model. A second model would go
// right here, before returning null.

const HERMETIC = ["--no-tools", "--no-session", "--no-skills", "--no-extensions", "--no-context-files"];

// ":low" on purpose. Default/":high" spends the time thinking and measured 4–12s
// on the same retrieval prompt; ":low" is 3.4–3.7s with the same answer. ":none"
// is not a valid effort here — it fails in half a second.
export const DEFAULT_MODEL = "deepseek/deepseek-v4-flash:low";

export async function piCall(
  prompt: string,
  { model = DEFAULT_MODEL, timeoutMs = 8000 }: { model?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const proc = Bun.spawn(["pi", "-p", "--mode", "json", "--model", model, ...HERMETIC, prompt], {
    stdout: "pipe",
    stderr: "ignore",
    stdin: "ignore",
  });
  const killer = setTimeout(() => proc.kill(9), timeoutMs);
  try {
    const out = await new Response(proc.stdout).text();
    if ((await proc.exited) !== 0) return null;
    let last = "";
    for (const line of out.split("\n")) {
      if (!line.startsWith("{")) continue;
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      const msgs = o.type === "agent_end" ? o.messages : o.type === "message_end" ? [o.message] : null;
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        if (m?.role !== "assistant") continue;
        const text = (Array.isArray(m.content) ? m.content : [])
          .filter((c: any) => c?.type === "text" && c.text)
          .map((c: any) => c.text)
          .join("\n")
          .trim();
        if (text) last = text; // keep the last non-empty one
      }
    }
    return last || null;
  } catch {
    return null;
  } finally {
    clearTimeout(killer);
  }
}

if (import.meta.main) {
  const t0 = Date.now();
  const answer = await piCall(process.argv[2] ?? "只回复 PONG", {
    model: process.argv[3] ?? DEFAULT_MODEL,
    timeoutMs: Number(process.argv[4] ?? 8000),
  });
  console.log(`[${Date.now() - t0}ms] ${answer ?? "(null)"}`);
}
