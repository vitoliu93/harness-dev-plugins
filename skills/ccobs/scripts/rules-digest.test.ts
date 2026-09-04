import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeScope, parseRuleLine, pickRules, projectKey, pruneStale, renderRuleLine, sweepLearnedInbox } from "./rules-digest.ts";

// If render and parse ever drift, every existing rule reads back as count 1 and
// rollup rewrites the digest with all counts reset — the hand-curated content is
// exactly what gets destroyed. This is the check that fails first.
test("a rendered rule line parses back unchanged", () => {
  const r = { text: "部署前需先push本地commit到远端", count: 7, last: "2026-08-20" };
  expect(parseRuleLine(renderRuleLine(r))).toEqual(r);
});

test("a hand-edited line without the suffix still counts as a rule", () => {
  expect(parseRuleLine("- 改写过的规则")).toEqual({ text: "改写过的规则", count: 1, last: "1970-01-01" });
});

test("non-rule lines are ignored", () => {
  expect(parseRuleLine("# 项目规则")).toBeNull();
  expect(parseRuleLine("<!-- ccobs-rollup watermark: 2026-08-20T00:00:00.000Z -->")).toBeNull();
});

test("writer and reader derive the same project key", () => {
  const cwd = "/w/codebase/proj";
  expect(projectKey(cwd)).toBe("-w-codebase-proj");
  expect(projectKey(cwd + "/")).toBe(projectKey(cwd));
  // a worktree folds into its parent project on both sides
  expect(projectKey(cwd + "/.claude/worktrees/feat-a")).toBe(projectKey(cwd));
  expect(normalizeScope("-w-codebase-proj--claude-worktrees-feat-a")).toBe(projectKey(cwd));
});

// --- sweepLearnedInbox -------------------------------------------------------

const INBOX = [
  "# LEARNED — raw inbox (auto-captured by learn-capture hook; graduate via /debrief)",
  "- 2026-08-20 [correction] 旧条目，会话早已蒸馏",
  "- 2026-09-03 [project] 水位线前一天的条目",
  "- 2026-09-04 [feedback] 水位线当天的条目，会话可能还没蒸馏",
  "- 没有日期的手写行要原样保留",
  "",
].join("\n");

function tmpInbox(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "learned-sweep-"));
  const p = join(dir, "LEARNED.md");
  writeFileSync(p, content);
  return p;
}

test("sweep removes entries before the watermark day, keeps that day and everything unparsed", () => {
  const p = tmpInbox(INBOX);
  expect(sweepLearnedInbox(p, "2026-09-04")).toBe(2);
  const after = readFileSync(p, "utf8");
  expect(after).toContain("raw inbox");
  expect(after).not.toContain("2026-08-20");
  expect(after).not.toContain("2026-09-03");
  expect(after).toContain("- 2026-09-04 [feedback]");
  expect(after).toContain("没有日期的手写行");
  rmSync(join(p, ".."), { recursive: true, force: true });
});

test("sweep is idempotent and a no-op leaves the file untouched", () => {
  const p = tmpInbox(INBOX);
  sweepLearnedInbox(p, "2026-09-04");
  const once = readFileSync(p, "utf8");
  expect(sweepLearnedInbox(p, "2026-09-04")).toBe(0);
  expect(readFileSync(p, "utf8")).toBe(once);
});

test("sweep survives a missing file and a bad watermark", () => {
  expect(sweepLearnedInbox(join(tmpdir(), "does-not-exist", "LEARNED.md"), "2026-09-04")).toBe(0);
  const p = tmpInbox(INBOX);
  expect(sweepLearnedInbox(p, "not-a-date")).toBe(0);
  expect(sweepLearnedInbox(p, "1970-01-01")).toBe(0); // EPOCH watermark sweeps nothing
  expect(readFileSync(p, "utf8")).toBe(INBOX);
});

test("replay picks: drops ×1 notes, one-project 'global' rules, and rules the context already states", () => {
  const r = (text: string, count: number) => ({ text, count, last: "2026-09-01" });
  const digests = new Map([
    ["proj-a", [r("检查远程仓库前必须 git fetch 避免假阳性", 3), r("改动必须基于 dev 分支而非 main", 6)]],
    ["proj-b", [r("检查远程前先 git fetch，避免假阳性", 2)]],
  ]);
  const picked = pickRules({
    project: [
      r("每次发布必须把三份清单改成同一版本：plugin.json、marketplace.json", 7),
      r("修改 SKILL.md 后必须跑 skill-atlas 对账", 2),
      r("数据库懒打开错误需探针查询触发", 1),
    ],
    global: [
      r("检查远程仓库前必须git fetch避免假阳性", 7), // echoed by two projects → global
      r("改动必须基于dev分支而非main", 6), // only proj-a says so → not global
    ],
    digests,
    known: ["每次发布都把 plugin.json、marketplace.json 改成同一版本，再提交和推送。"],
    limit: 12,
  });
  expect(picked.project.map((x) => x.text)).toEqual(["修改 SKILL.md 后必须跑 skill-atlas 对账"]);
  expect(picked.global.map((x) => x.text)).toEqual(["检查远程仓库前必须git fetch避免假阳性"]);
});

test("pruneStale drops ×1 rules older than the window and keeps everything else", () => {
  const rules = [
    { text: "old note", count: 1, last: "2026-05-01" },
    { text: "fresh note", count: 1, last: "2026-08-20" },
    { text: "old but repeated", count: 2, last: "2026-01-01" },
  ];
  expect(pruneStale(rules, "2026-09-05").map((r) => r.text)).toEqual(["fresh note", "old but repeated"]);
});
