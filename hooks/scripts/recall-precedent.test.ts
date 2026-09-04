import { expect, test } from "bun:test";

import { parsePrecedents, parseRuleRefs } from "./recall-precedent.ts";

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

test("rule refs parse with tolerant markers, dedupe, and cap", () => {
  expect(parseRuleRefs("R:3\n- R: 7\n* r：12\nR:3\nR:1", 3)).toEqual([3, 7, 12]);
});

test("rule refs ignore precedent lines, prose and NONE", () => {
  expect(parseRuleRefs(`- 2026-08-20 ${SID} — 排查视频为空\nNONE\n规则 R:3 不算，因为混在句子里`, 3)).toEqual([]);
});
