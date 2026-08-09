import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { canonical_skill, collect_usage } from "./skill_usage.ts";

const ALIASES = {
  report: "no-ai-slop",
  campaign: "kox-agent-plugins:ship",
  ship: "kox-agent-plugins:ship",
};
const NAMESPACE_FOLDS = { "vito-agent-plugins:": "dev-kit:" };

describe("canonical_skill", () => {
  test("folds bare and namespaced aliases", () => {
    expect(canonical_skill("report", ALIASES, NAMESPACE_FOLDS)).toBe("no-ai-slop");
    expect(canonical_skill("dev-kit:report", ALIASES, NAMESPACE_FOLDS)).toBe("no-ai-slop");
    expect(canonical_skill("dev-kit:campaign", ALIASES, NAMESPACE_FOLDS)).toBe("kox-agent-plugins:ship");
  });

  test("folds old plugin namespace", () => {
    expect(canonical_skill("vito-agent-plugins:no-ai-slop", ALIASES, NAMESPACE_FOLDS)).toBe("no-ai-slop");
  });

  test("preserves external canonical target", () => {
    expect(canonical_skill("campaign", ALIASES, NAMESPACE_FOLDS)).toBe("kox-agent-plugins:ship");
    expect(canonical_skill("kox-agent-plugins:ship", ALIASES, NAMESPACE_FOLDS)).toBe("kox-agent-plugins:ship");
  });
});

describe("collect_usage", () => {
  test("aggregates aliases without merging sources", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-usage-"));
    try {
      const db = path.join(tmp, "obs.db");
      const conn = new Database(db);
      conn.exec(`
        CREATE TABLE sessions (session_id TEXT PRIMARY KEY, source TEXT);
        CREATE TABLE tool_calls (
          session_id TEXT, tool TEXT, skill TEXT, ts TEXT
        );
        INSERT INTO sessions VALUES ('s1', 'claude-code');
        INSERT INTO sessions VALUES ('s2', 'cursor-ide');
        INSERT INTO tool_calls VALUES
          ('s1', 'Skill', 'report', '2026-08-01T10:00:00Z'),
          ('s1', 'Skill', 'dev-kit:no-ai-slop', '2026-08-02T10:00:00Z'),
          ('s2', 'SlashCommand', 'dev-kit:report', '2026-08-03T10:00:00Z');
      `);
      conn.close();

      const rows = collect_usage(db, ALIASES, NAMESPACE_FOLDS, "2026-01-01T00:00:00Z", 30);
      expect(rows).toHaveLength(2);
      expect(rows[0]["source"]).toBe("claude-code");
      expect(rows[0]["skill"]).toBe("no-ai-slop");
      expect(rows[0]["calls"]).toBe(2);
      expect(rows[0]["sessions"]).toBe(1);
      expect(rows[1]["source"]).toBe("cursor-ide");
      expect(rows[1]["calls"]).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
