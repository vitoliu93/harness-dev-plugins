import { expect, test } from "bun:test";

import { normalizeScope, parseRuleLine, projectKey, renderRuleLine } from "./rules-digest.ts";

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
