#!/usr/bin/env bun
// Shared between the writer (rollup.ts) and the readers (session-replay hook,
// recall skill). The project key MUST be derived by one function on both sides:
// a mismatch shows up as "no rules yet", which is indistinguishable from success
// because the hook always exits 0.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

/**
 * Trim `.claude/LEARNED.md` entries dated before the rollup watermark day:
 * those sessions are already distilled (or gated out of distill for good), so
 * the raw inbox only keeps what the pipeline hasn't caught up with. Entries
 * from the watermark day itself stay — their sessions may still be pending.
 * Header, blank and undated lines always survive. Returns removed line count.
 */
export function sweepLearnedInbox(learnedPath: string, watermarkDay: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(watermarkDay)) return 0;
  let mtimeBefore: number;
  try { mtimeBefore = statSync(learnedPath).mtimeMs; } catch { return 0; } // no inbox → nothing to sweep
  const kept: string[] = [];
  let removed = 0;
  for (const line of readFileSync(learnedPath, "utf8").split("\n")) {
    const m = /^- (\d{4}-\d{2}-\d{2}) /.exec(line);
    if (m && m[1] < watermarkDay) { removed++; continue; }
    kept.push(line);
  }
  if (!removed) return 0;
  try {
    // a Stop hook may append concurrently; if the file moved, skip — next rollup retries
    if (statSync(learnedPath).mtimeMs !== mtimeBefore) return 0;
    writeFileSync(learnedPath, kept.join("\n"));
  } catch { return 0; }
  return removed;
}

/** A rule seen once and not seen again for this long is a stale note; rollup drops it from the digest. */
export const STALE_DAYS = 90;

export function pruneStale(rules: Rule[], today: string, days = STALE_DAYS): Rule[] {
  const cutoff = new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
  return rules.filter((r) => r.count > 1 || r.last >= cutoff);
}

/** How many project rules the SessionStart replay injects. */
export const MAX_PROJECT_RULES = 12;
/** A rule seen once is a note, not a rule; it stays in the digest but is not replayed. */
export const MIN_REPLAY_COUNT = 2;
/** A "global" rule must have been distilled independently in at least this many projects. */
export const MIN_GLOBAL_PROJECTS = 2;

const byWeight = (a: Rule, b: Rule) => b.count - a.count || b.last.localeCompare(a.last);

/** Character bigrams after dropping spaces and punctuation; works for Chinese and English alike. */
export function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[\s\p{P}]/gu, "");
  const out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}

/**
 * Overlap coefficient |A∩B| / min(|A|,|B|). Chosen over Jaccard so a short rule
 * that is fully contained in a long AGENTS.md sentence still reads as the same
 * rule. ponytail: bigram overlap misses paraphrases that share no characters
 * ("description应简洁" vs "技能描述需简洁"); an embedding pass if that matters.
 */
export function similar(a: Set<string>, b: Set<string>, threshold = 0.6): boolean {
  const small = a.size <= b.size ? a : b;
  const large = small === a ? b : a;
  if (!small.size) return false;
  let hit = 0;
  for (const g of small) if (large.has(g)) hit++;
  return hit / small.size >= threshold;
}

/** Every project digest on disk, keyed by scope; `_global` excluded. */
export function readProjectDigests(): Map<string, Rule[]> {
  const out = new Map<string, Rule[]>();
  if (!existsSync(RULES_DIR)) return out;
  for (const f of readdirSync(RULES_DIR)) {
    if (!f.endsWith(".md")) continue;
    const scope = f.slice(0, -3);
    if (scope === GLOBAL_SCOPE) continue;
    out.set(scope, readRules(scope));
  }
  return out;
}

export type PickInput = {
  project: Rule[];
  global: Rule[];
  /** other projects' rules, to decide which global rules are really cross-project */
  digests: Map<string, Rule[]>;
  /** lines already in the model's context (AGENTS.md / CLAUDE.md); rules echoing them are dropped */
  known: string[];
  limit: number;
};

/** Pure selection; topRules is the IO wrapper. */
export function pickRules({ project, global, digests, known, limit }: PickInput): { project: Rule[]; global: Rule[] } {
  const knownG = known.map(bigrams).filter((g) => g.size >= 6);
  const echoed = (g: Set<string>, list: Set<string>[]) => list.some((k) => similar(g, k));

  const projectPicked: Rule[] = [];
  const projectG: Set<string>[] = [];
  for (const r of project.filter((r) => r.count >= MIN_REPLAY_COUNT).sort(byWeight)) {
    const g = bigrams(r.text);
    if (echoed(g, knownG) || echoed(g, projectG)) continue;
    projectPicked.push(r);
    projectG.push(g);
    if (projectPicked.length >= limit) break;
  }

  const digestG = [...digests.values()].map((rules) => rules.map((r) => bigrams(r.text)));
  const globalPicked: Rule[] = [];
  const globalG: Set<string>[] = [];
  for (const r of global.filter((r) => r.count >= 3).sort(byWeight)) {
    const g = bigrams(r.text);
    const projects = digestG.filter((list) => echoed(g, list)).length;
    if (projects < MIN_GLOBAL_PROJECTS) continue;
    if (echoed(g, knownG) || echoed(g, projectG) || echoed(g, globalG)) continue;
    globalPicked.push(r);
    globalG.push(g);
    if (globalPicked.length >= limit) break;
  }
  return { project: projectPicked, global: globalPicked };
}

/** Project rules first, then global rules that are really cross-project, minus anything the context already says. */
export function topRules(cwd: string, limit: number, known: string[] = []): { project: Rule[]; global: Rule[] } {
  return pickRules({
    project: readRules(projectKey(cwd)),
    global: readRules(GLOBAL_SCOPE),
    digests: readProjectDigests(),
    known,
    limit,
  });
}
