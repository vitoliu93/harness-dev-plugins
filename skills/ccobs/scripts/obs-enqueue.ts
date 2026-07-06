#!/usr/bin/env bun
// Stop hook: enqueue this session for later ingestion. Milliseconds, zero deps.
// Work and observation collection stay decoupled — this only appends one line;
// the launchd job (or the next report call) does the actual ingest + distill.
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OBS_DIR = process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability");

try {
  const payload = JSON.parse(await Bun.stdin.text());
  mkdirSync(OBS_DIR, { recursive: true });
  appendFileSync(
    join(OBS_DIR, "queue.jsonl"),
    JSON.stringify({
      session_id: payload.session_id ?? null,
      transcript_path: payload.transcript_path ?? null,
      ts: new Date().toISOString(),
    }) + "\n",
  );
} catch {}
