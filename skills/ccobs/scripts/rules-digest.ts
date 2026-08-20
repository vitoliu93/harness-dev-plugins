#!/usr/bin/env bun
// Shared between the writer (rollup.ts) and the readers (session-replay hook,
// recall skill). The project key MUST be derived by one function on both sides:
// a mismatch shows up as "no rules yet", which is indistinguishable from success
// because the hook always exits 0.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const OBS_DIR = process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability");
export const RULES_DIR = join(OBS_DIR, "rules");
export const GLOBAL_SCOPE = "_global";

export type Rule = { text: string; count: number; last: string };

const RULE_RE = /^- (.*?) ×(\d+) \(最近 (\d{4}-\d{2}-\d{2})\)$/;

/** The one place the digest line format lives. renderRuleLine must round-trip through parseRuleLine. */
export function renderRuleLine(r: Rule): string {
  return `- ${r.text} ×${r.count} (最近 ${r.last})`;
}

export function parseRuleLine(line: string): Rule | null {
  if (!line.startsWith("- ")) return null;
  const m = RULE_RE.exec(line);
  // a hand-edited line that lost its suffix still counts as a rule; it just restarts at 1
  return m
    ? { text: m[1], count: Number(m[2]), last: m[3] }
    : { text: line.slice(2).trim(), count: 1, last: "1970-01-01" };
}

/**
 * cwd -> the `sessions.project` key ccobs stores.
 * A git worktree under `<project>/.claude/worktrees/<name>` folds into its
 * parent project: the rules belong to the codebase, not to the branch.
 */
export function projectKey(cwd: string): string {
  // Claude Code's own encoding turns both "/" and "." into "-", which is why a
  // worktree shows up as "--claude-worktrees-" rather than "-.claude-...".
  return normalizeScope(cwd.replace(/\/+$/, "").replace(/[/.]/g, "-"));
}

/** Same fold applied to a key already stored in `sessions.project`. */
export function normalizeScope(project: string): string {
  const cut = project.indexOf("--claude-worktrees-");
  return cut === -1 ? project : project.slice(0, cut);
}

export function digestPath(scope: string): string {
  return join(RULES_DIR, `${scope}.md`);
}

export function readRules(scope: string): Rule[] {
  const p = digestPath(scope);
  if (!existsSync(p)) return [];
  const rules: Rule[] = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const r = parseRuleLine(line);
    if (r) rules.push(r);
  }
  return rules;
}

/** Project rules first, then global rules not already covered, by count desc. */
export function topRules(cwd: string, limit: number): { project: Rule[]; global: Rule[] } {
  const byWeight = (a: Rule, b: Rule) => b.count - a.count || b.last.localeCompare(a.last);
  const project = readRules(projectKey(cwd)).sort(byWeight).slice(0, limit);
  const seen = new Set(project.map((r) => r.text));
  const global = readRules(GLOBAL_SCOPE)
    .filter((r) => r.count >= 3 && !seen.has(r.text))
    .sort(byWeight)
    .slice(0, limit);
  return { project, global };
}
