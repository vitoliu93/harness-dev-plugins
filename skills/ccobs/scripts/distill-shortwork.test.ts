// distill 只蒸馏干过活的会话。门槛有两道:轮数 >= 3,输出 token >= 500。
// SQL 是从 distill.ts 源码里抠出来跑的,不是抄一份 —— 抄一份的话改了实现
// 测试照样绿。
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// distill.ts 是个脚本,import 会直接把它跑起来,所以只取文本。
const SRC = readFileSync(join(import.meta.dir, "distill.ts"), "utf8");
const PENDING_SQL = /`(SELECT s\.session_id, s\.file_path[\s\S]*?LIMIT \?2)`/.exec(SRC)?.[1];

function seeded(): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE sessions (session_id TEXT PRIMARY KEY, kind TEXT, source TEXT,
           file_path TEXT, ended_at TEXT)`);
  db.exec(`CREATE TABLE observations (session_id TEXT PRIMARY KEY)`);
  db.exec(`CREATE TABLE turns (session_id TEXT, output_tokens INTEGER)`);
  const add = (id: string, turns: number, tokensEach: number) => {
    db.prepare(`INSERT INTO sessions VALUES (?,'main','claude-code','/tmp/x.jsonl','2020-01-01T00:00:00')`).run(id);
    for (let i = 0; i < turns; i++) {
      db.prepare(`INSERT INTO turns VALUES (?,?)`).run(id, tokensEach);
    }
  };
  add("real", 8, 400);   // 8 轮 3200 token —— 干了活
  add("hi", 3, 20);      // 3 轮 60 token —— 就是打了声招呼
  add("oneturn", 1, 9000); // 1 轮,再长也是单轮
  add("notoken", 6, 0);  // 有轮数没输出
  return db;
}

function pending(db: Database, sessionArg: string | null): string[] {
  return db.prepare(PENDING_SQL!).all(sessionArg, 50).map((r: any) => r.session_id);
}

test("distill 门槛:短会话和单轮会话进不了待蒸馏队列", () => {
  expect(PENDING_SQL).toBeTruthy();
  const db = seeded();
  // 先证明这四条会话都在库里。少了这句,下面的断言在空表上也会绿。
  expect(db.prepare(`SELECT COUNT(*) n FROM sessions`).get()).toEqual({ n: 4 });
  expect(pending(db, null)).toEqual(["real"]);
});

test("--session 手动指定时,门槛不拦", () => {
  const db = seeded();
  expect(pending(db, "hi")).toEqual(["hi"]);
});
