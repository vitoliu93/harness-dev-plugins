import { expect, test } from "bun:test";

import { parsePrecedents } from "./recall-precedent.ts";

const SID = "d1973f49-faf8-41e6-9112-5896e16434a2";

test("keeps the asked-for format", () => {
  expect(parsePrecedents(`- 2026-08-20 ${SID} — 排查视频为空`)).toEqual([
    `- 2026-08-20 ${SID} — 排查视频为空`,
  ]);
});

test("recovers rows the model returned without a bullet", () => {
  // measured: one prompt wording made the model drop the "- " on every row,
  // and the old prefix filter threw away three good precedents
  expect(parsePrecedents(`2026-08-20 ${SID} — 排查视频为空\n* 2026-08-18 ${SID} - 素材推荐为空`)).toEqual([
    `- 2026-08-20 ${SID} — 排查视频为空`,
    `- 2026-08-18 ${SID} — 素材推荐为空`,
  ]);
});

test("a prose refusal yields nothing", () => {
  expect(parsePrecedents("没有。")).toEqual([]);
  expect(parsePrecedents("NONE")).toEqual([]);
});

