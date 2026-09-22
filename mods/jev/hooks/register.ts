import type { On, PluginOptions, Timer } from "claude-code";
import { agentsFrom, clean, decide, historyFrom, makeRequest, recentFrom, render, type Snapshot } from "./core.ts";

export function register(on: On, options: PluginOptions): void {
  // Serialize overlapping submissions' marker updates; never leave an ownership
  // token behind after downstream classic hooks finish (including hot unload).
  let owners = 0;
  let markerUpdate: Promise<void> = Promise.resolve();
  const updateMarker = (operation: () => Promise<void>) => {
    markerUpdate = markerUpdate.catch(() => {}).then(operation);
    return markerUpdate;
  };
  on("prompt.submit", async ($, e, next) => {
    // Notifications and plugin-generated prompts must never start another routing loop.
    if (!["composer", "bridge", "sdk"].includes(e.origin?.kind) || !e.text.trim() || /^[!/]/.test(e.text.trim())) return next(e);
    let extra: string | undefined;
    let ownSession: string | undefined;
    let timer: Timer | undefined;
    let expired = false;
    let abort: (() => void) | undefined;
    try {
      const session = await $.session.id();
      // The key is the only switch: no key, no Jev, and the session must not stay
      // owned by a Mod that cannot work — the legacy recall has to take over again.
      const key = String(options.apiKey || await $.env.get("TYPESAFE_API_KEY") || "");
      if (!key) {
        if (!owners && await $.env.get("DEVKIT_JEV_RECALL_SESSION") === session) await $.env.set("DEVKIT_JEV_RECALL_SESSION", undefined);
      } else {
        // This authenticated Mod owns recall for this session, including failure:
        // no second 12-second legacy model call after a Jev timeout. Child sessions have other IDs.
        ownSession = session;
        const timeoutMs = Math.min(8000, Math.max(200, Number(options.timeoutMs) || 3000));
        const deadline = new Promise<null>(resolve => {
          abort = () => { expired = true; resolve(null); };
          timer = $.clock.after(timeoutMs, abort);
          next.signal.addEventListener("abort", abort, { once: true });
          if (next.signal.aborted) abort();
        });
        const work = async (): Promise<string | null> => {
          const [home, cwd, messages, active, now, obsOverride, agentsOverride] = await Promise.all([
            $.env.get("HOME"), $.session.cwd(), $.session.messages(), $.agent.list(), $.clock.now(),
            $.env.get("CCOBS_DIR"), $.env.get("AGENTS_CONFIG"),
          ]);
          if (expired || !home) return null;
          const root = obsOverride || `${home}/.claude/observability`;
          let catalog: unknown = {}, quota: unknown = {};
          try { catalog = JSON.parse(await $.fs.read(agentsOverride || `${root}/agents/agents.json`)); } catch { /* no catalogue: main agent only */ }
          try {
            const path = `${root}/agents/quota.json`;
            if (await $.fs.exists(path)) quota = JSON.parse(await $.fs.read(path));
          } catch { catalog = {}; } // unknown quota state must not advertise unavailable routes
          const recent = recentFrom(messages, [key]);
          let rows: unknown = [];
          if (!expired) {
            try {
              const result = await $.process.run(["bun", `${$.plugin.root}/scripts/recall-candidates.ts`], {
                stdin: JSON.stringify({ cwd, query: `${e.text.slice(0,3000)}\n${recent.map(m=>m.text).join("\n")}`, session }),
                timeoutMs: Math.min(timeoutMs, 1500),
              });
              if (result.exitCode === 0 && result.stdout.length <= 100_000) rows = JSON.parse(result.stdout);
            } catch { /* recall unavailable: routing can still work */ }
          }
          if (expired) return null;
          const snapshot: Snapshot = {
            prompt: e.text, recent, agents: agentsFrom(catalog, quota, now, [key]), history: historyFrom(rows, session, [key]),
            active: active.filter(a => a.status === "running").map(a => ({ name: a.name || a.id, description: a.description })),
          };
          // Nothing to choose between: an empty advice block would only cost context.
          if (!snapshot.agents.length && !snapshot.history.length) return null;
          const model = typeof options.model === "string" ? options.model : "jev-1.13.0";
          const body = makeRequest(snapshot, model, [key]);
          if (expired) return null;
          const response = await $.http.fetch("https://api.typesafe.ai/v1/systemone", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` }, body,
          });
          if (expired) return null;
          if (!response.ok || response.text.length > 100_000) throw new Error(`http-${response.status}`);
          const result = decide(JSON.parse(response.text), snapshot);
          $.ui.log(`dev-kit-jev: ${result.delegation}; ${result.agents.length} agent suggestion(s), ${result.history.length} reference(s)`, { to: "debug" });
          return render(result);
        };
        extra = await Promise.race([work(), deadline]) ?? undefined;
        if (expired && !next.signal.aborted) $.ui.log("dev-kit-jev: timed out; continuing without recommendations", { to: "debug" });
      }
    } catch {
      // Never log the error object: provider failures can carry request bodies or credentials.
      $.ui.log("dev-kit-jev: unavailable; continuing without recommendations", { to: "debug" });
    } finally {
      expired = true;
      timer?.cancel();
      if (abort) next.signal.removeEventListener("abort", abort);
    }
    // Call next exactly once, outside the catch: a downstream failure must never replay the prompt.
    let claimed = false;
    if (ownSession) {
      await updateMarker(async () => {
        await $.env.set("DEVKIT_JEV_RECALL_SESSION", ownSession);
        owners++;
        claimed = true;
      }).catch(() => {});
    }
    try {
      return await next(extra ? { ...e, context: [...(e.context ?? []), extra] } : e);
    } finally {
      if (claimed) await updateMarker(async () => {
        if (--owners === 0) await $.env.set("DEVKIT_JEV_RECALL_SESSION", undefined);
      }).catch(() => {});
    }
  });
}
