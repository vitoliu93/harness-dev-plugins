#!/usr/bin/env bun
// Report skill usage after folding renamed and namespaced identities.
// Ported 1:1 from skill_usage.py; sqlite3 is replaced by bun:sqlite (readonly).

import path from "node:path";
import { Database } from "bun:sqlite";
import { parseCli, pyHome, pyJsonDumps, pyJsonParse, pyResolve, pyStr, readTextStrict, type CliSpec } from "./pycompat.ts";

const DEFAULT_DB = path.join(pyHome(), ".claude", "observability", "obs.db");
const DEFAULT_ALIASES = path.join(pyResolve(path.join(import.meta.dir, "..", "..")), "skill-review", "aliases.json");

export function load_identity_map(p: string): [Record<string, string>, Record<string, string>] {
  const data = pyJsonParse(readTextStrict(p));
  const aliases = data?.aliases ?? {};
  const namespaceFolds = data?.namespace_folds ?? {};
  return [aliases, namespaceFolds];
}

export function canonical_skill(
  raw: string,
  aliases: Record<string, string>,
  namespaceFolds: Record<string, string>,
): string {
  let skill = raw;
  for (const [oldPrefix, newPrefix] of Object.entries(namespaceFolds)) {
    if (oldPrefix.startsWith("_")) continue;
    if (skill.startsWith(oldPrefix)) {
      skill = newPrefix + skill.slice(oldPrefix.length);
      break;
    }
  }

  if (Object.prototype.hasOwnProperty.call(aliases, skill)) return aliases[skill];

  const base = skill.split(":").pop()!;
  if (Object.prototype.hasOwnProperty.call(aliases, base)) return aliases[base];
  if (skill.startsWith("dev-kit:")) return base;
  return skill;
}

export function collect_usage(
  db: string,
  aliases: Record<string, string>,
  namespaceFolds: Record<string, string>,
  since: string | null,
  days: number,
): Array<Record<string, any>> {
  const predicate = since ? "tc.ts >= ?" : "tc.ts >= datetime('now', ?)";
  const value = since ?? `-${days} days`;
  const query = `
        SELECT s.source, tc.session_id, tc.skill, tc.ts
        FROM tool_calls tc
        JOIN sessions s ON s.session_id = tc.session_id
        WHERE tc.tool IN ('Skill', 'SlashCommand')
          AND tc.skill IS NOT NULL
          AND ${predicate}
    `;

  const grouped = new Map<string, Record<string, any>>();
  const conn = new Database(db, { readonly: true });
  try {
    const rows = conn.query(query).all(value) as Array<{
      source: string;
      session_id: string;
      skill: string;
      ts: string | null;
    }>;
    for (const row of rows) {
      const skill = canonical_skill(row.skill, aliases, namespaceFolds);
      const key = JSON.stringify([row.source, skill]);
      let item = grouped.get(key);
      if (!item) {
        item = { source: row.source, skill, calls: 0, sessions: new Set<string>(), last_used: null };
        grouped.set(key, item);
      }
      item.calls += 1;
      item.sessions.add(row.session_id);
      const current = item.last_used ?? row.ts;
      item.last_used = current! >= row.ts! ? current : row.ts;
    }
  } finally {
    conn.close();
  }

  const rows = [...grouped.values()].map((item) => ({
    source: item.source,
    skill: item.skill,
    calls: item.calls,
    sessions: item.sessions.size,
    last_used: item.last_used,
  }));
  return rows.sort((a, b) => {
    if (a.calls !== b.calls) return b.calls - a.calls;
    if (a.skill !== b.skill) return a.skill < b.skill ? -1 : 1;
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return 0;
  });
}

export function print_table(rows: Array<Record<string, any>>): string {
  const columns = ["source", "skill", "calls", "sessions", "last_used"];
  const widths: Record<string, number> = {};
  for (const column of columns) {
    widths[column] = Math.max(column.length, ...rows.map((row) => pyStr(row[column]).length));
  }
  const lines = [columns.map((column) => column.padEnd(widths[column])).join("  ")];
  for (const row of rows) {
    lines.push(columns.map((column) => pyStr(row[column]).padEnd(widths[column])).join("  "));
  }
  return lines.join("\n") + "\n";
}

function main(): void {
  const spec: CliSpec = {
    prog: path.basename(process.argv[1] ?? "skill_usage.ts"),
    description: "Aggregate obs.db skill usage through aliases.json.",
    options: [
      { flag: "--db", dest: "db", kind: "store", type: "str", default: DEFAULT_DB },
      { flag: "--aliases", dest: "aliases", kind: "store", type: "str", default: DEFAULT_ALIASES },
      { flag: "--days", dest: "days", kind: "store", type: "int", default: 30 },
      { flag: "--since", dest: "since", kind: "store", type: "str", help: "ISO timestamp; overrides --days" },
      { flag: "--skill", dest: "skill", kind: "store", type: "str", help: "Show one canonical skill identity" },
      { flag: "--json", dest: "json", kind: "store_true" },
    ],
  };
  const args = parseCli(spec, process.argv.slice(2));

  const [aliases, namespaceFolds] = load_identity_map(args.aliases);
  let rows = collect_usage(args.db, aliases, namespaceFolds, args.since, args.days);
  if (args.skill) {
    const target = canonical_skill(args.skill, aliases, namespaceFolds);
    rows = rows.filter((row) => row["skill"] === target);
  }

  if (args.json) {
    process.stdout.write(pyJsonDumps(rows) + "\n");
  } else {
    process.stdout.write(print_table(rows));
  }
}

if (import.meta.main) {
  main();
}
