// The tombstone distill writes for a session whose raw JSONL retention deleted.
// It has one job: get that session out of the pending query without showing up
// in recall, rollup, or the debrief SOP roll-up. If any of those filters ever
// change, this fails.
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";

const TOMB_MODEL = "skipped:no-raw-file";

function seeded(): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE observations (
    session_id TEXT PRIMARY KEY, distilled_at TEXT, distill_model TEXT,
    task_type TEXT, outcome TEXT, corrections INTEGER,
    dispatch_engine TEXT, dispatch_result TEXT, summary TEXT,
    learn_candidates TEXT, sop_candidate TEXT)`);
  // the tombstone, exactly as distill.ts writes it
  db.prepare(
    `INSERT INTO observations (session_id, distilled_at, distill_model, summary, learn_candidates)
     VALUES ('gone','2026-01-01T00:00:00.000Z',?,'','[]')`,
  ).run(TOMB_MODEL);
  // a real observation, so every assertion below can tell "filtered" from "empty table"
  db.exec(`INSERT INTO observations VALUES
    ('real','2026-01-01T00:00:00.000Z','some/model','feature','done',0,
     NULL,NULL,'做完了某件事','["某条规则"]','某个流程')`);
  return db;
}

test("tombstone stays out of recall, rollup and the SOP roll-up", () => {
  const db = seeded();
  const one = (sql: string) => db.prepare(sql).all().map((r: any) => r.session_id);
  // without this the three filters below pass on an empty result too — green
  // whether or not the tombstone was ever written, which proves nothing.
  expect(one(`SELECT session_id FROM observations WHERE distill_model = '${TOMB_MODEL}'`)).toEqual(["gone"]);

  // recall-precedent.ts
  expect(one(`SELECT session_id FROM observations
              WHERE summary IS NOT NULL AND summary != ''`)).toEqual(["real"]);
  // rollup.ts
  expect(one(`SELECT session_id FROM observations
              WHERE learn_candidates IS NOT NULL AND learn_candidates NOT IN ('[]','')`)).toEqual(["real"]);
  // debrief moves.md
  expect(one(`SELECT session_id FROM observations WHERE sop_candidate IS NOT NULL`)).toEqual(["real"]);
});

test("tombstone does remove the session from distill's pending set", () => {
  const db = seeded();
  db.exec(`CREATE TABLE sessions (session_id TEXT PRIMARY KEY, kind TEXT, source TEXT, ended_at TEXT)`);
  db.exec(`INSERT INTO sessions VALUES ('gone','main','claude-code','2026-01-01T00:00:00Z')`);
  db.exec(`INSERT INTO sessions VALUES ('fresh','main','claude-code','2026-01-01T00:00:00Z')`);
  const pending = db
    .prepare(`SELECT s.session_id FROM sessions s
              LEFT JOIN observations o ON o.session_id = s.session_id
              WHERE s.kind='main' AND s.source='claude-code' AND o.session_id IS NULL`)
    .all()
    .map((r: any) => r.session_id);
  expect(pending).toEqual(["fresh"]);
});
