#!/usr/bin/env bun
// One CLI for every Exa surface: bun exa.ts <path> [json-body]
// POST when a body is given, GET otherwise. `agent` creates a run and polls to completion.

const API = "https://api.exa.ai";
const KEY = process.env.EXA_API_KEY;
if (!KEY) {
  console.error("EXA_API_KEY is not set");
  process.exit(1);
}

const [rawPath, rawBody] = Bun.argv.slice(2);
if (!rawPath) {
  console.error(
    "usage: bun exa.ts <search|contents|context|agent|websets/v0/...> ['{json}']",
  );
  process.exit(1);
}

async function call(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}/${path.replace(/^\//, "")}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY! },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Exa ${res.status} on /${path}: ${text}`);
  return JSON.parse(text);
}

const body = rawBody ? JSON.parse(rawBody) : undefined;
const path = rawPath === "agent" ? "agent/runs" : rawPath;

try {
  let data = await call(path, body);

  // /agent is async: create returns a run, so poll until it settles.
  if (path === "agent/runs" && body && data.id) {
    const started = Date.now();
    while (!["completed", "failed", "cancelled"].includes(data.status)) {
      if (Date.now() - started > 15 * 60_000) {
        throw new Error(`agent run ${data.id} still ${data.status} after 15min`);
      }
      await new Promise((r) => setTimeout(r, 4000));
      data = await call(`agent/runs/${data.id}`);
    }
  }

  console.log(render(path, data));
} catch (e) {
  // API errors are expected traffic (401 plan gates, 400 bad shapes) — report, don't stack-trace.
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

function render(path: string, d: any): string {
  // /context returns one pre-formatted markdown blob — that IS the payload.
  if (path === "context") return d.response ?? JSON.stringify(d, null, 2);

  if (path.startsWith("agent/runs")) {
    if (d.status && d.status !== "completed") {
      return `run ${d.id} ${d.status}\n${JSON.stringify(d.error ?? d, null, 2)}`;
    }
    const out = d.output ?? {};
    return [
      out.text,
      out.structured && JSON.stringify(out.structured, null, 2),
      out.grounding && `\nGrounding:\n${JSON.stringify(out.grounding, null, 2)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (Array.isArray(d.results) && (path === "search" || path === "contents")) {
    const failed = (d.statuses ?? []).filter((s: any) => s.status !== "success");
    const blocks = d.results.map((r: any, i: number) =>
      [
        `## ${i + 1}. ${r.title ?? r.url ?? "Untitled"}`,
        r.url && `URL: ${r.url}`,
        r.publishedDate && `Published: ${r.publishedDate}`,
        r.summary && `\n${r.summary}`,
        r.highlights?.length && `\n${r.highlights.join("\n\n")}`,
        r.text && `\n${r.text}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    if (d.output?.content) {
      blocks.unshift(`## Output\n${JSON.stringify(d.output.content, null, 2)}`);
    }
    if (!blocks.length) blocks.push("No results.");
    // /contents can 200 with per-URL failures; surface them instead of silently dropping.
    if (failed.length) {
      blocks.push(`## Failed URLs\n${JSON.stringify(failed, null, 2)}`);
    }
    return blocks.join("\n\n---\n\n");
  }

  return JSON.stringify(d, null, 2); // websets, monitors, anything else
}
