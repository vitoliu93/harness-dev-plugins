import type { On, PluginOptions, Timer } from "claude-code";
import { decide, historyFrom, makeRequest, recentFrom, render, skillsFrom, type Snapshot } from "./core.ts";

// ponytail: one in-memory cache per working directory; a new skill shows up within five minutes or on restart.
const SKILL_CACHE_MS = 300_000;

export function register(on: On, options: PluginOptions): void {
  const skillCache = new Map<string, { at: number; rows: unknown }>();
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
          const [cwd, messages, now] = await Promise.all([$.session.cwd(), $.session.messages(), $.clock.now()]);
          if (expired) return null;
          const recent = recentFrom(messages, [key]);
          // Both adapters are separate read-only processes: SQLite and globbing are unavailable inside the Mod.
          const adapter = async (script: string, stdin: Record<string, string>, fallback: unknown): Promise<unknown> => {
            if (expired) return fallback;
            try {
              const result = await $.process.run(["bun", `${$.plugin.root}/scripts/${script}`], { stdin: JSON.stringify(stdin), timeoutMs: Math.min(timeoutMs, 1500) });
              return result.exitCode === 0 && result.stdout.length <= 200_000 ? JSON.parse(result.stdout) : fallback;
            } catch { return fallback; }
          };
          const cached = skillCache.get(cwd);
          const skillsPromise = cached && now - cached.at < SKILL_CACHE_MS ? Promise.resolve(cached.rows)
            : adapter("scan-skills.ts", { cwd }, null).then(rows => { if (rows) skillCache.set(cwd, { at: now, rows }); return rows ?? []; });
          const [rawSkills, rows] = await Promise.all([
            skillsPromise,
            adapter("recall-candidates.ts", { cwd, query: `${e.text.slice(0, 3000)}\n${recent.slice(-4).map(m => m.text).join("\n")}`, session }, []),
          ]);
          if (expired) return null;
          const full: Snapshot = { prompt: e.text, recent, skills: skillsFrom(rawSkills, [key]), history: historyFrom(rows, session, [key]) };
          // Nothing to choose between: no request, no context cost.
          if (!full.skills.length && !full.history.length) return null;
          const model = typeof options.model === "string" ? options.model : "jev-1.13.0";
          const { body, snapshot } = makeRequest(full, model, [key]);
          if (expired) return null;
          const response = await $.http.fetch("https://api.typesafe.ai/v1/systemone", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` }, body,
          });
          if (expired) return null;
          if (!response.ok || response.text.length > 100_000) throw new Error(`http-${response.status}`);
          const result = decide(JSON.parse(response.text), snapshot);
          $.ui.log(`dev-kit-jev: ${result.skills.length} skill suggestion(s) from ${snapshot.skills.length}/${full.skills.length} scored, ${result.history.length} reference(s)`, { to: "debug" });
          return render(result) || null;
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
