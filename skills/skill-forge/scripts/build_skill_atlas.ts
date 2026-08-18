#!/usr/bin/env bun
// Build a Skill Atlas for a workspace of agent skills.
// Ported 1:1 from build_skill_atlas.py. Frontmatter parsing intentionally
// implements the original dependency-free fallback parser (plain key: value
// lines and folded >-/| blocks) — no external YAML package is involved.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  F,
  PyFloat,
  csvRow,
  isoDate,
  daysBetween,
  num,
  parseCli,
  parseDateYMD,
  pyHome,
  pyInt,
  pyJsonDumps,
  pyJsonParse,
  pyOr,
  pyResolve,
  pySlice,
  pySplitLines,
  pyStr,
  pyStrip,
  pyLstrip,
  pyTruthy,
  readTextReplace,
  readTextStrict,
  round3,
  safeRel as safeRelCompat,
  stripChars,
  todayLocal,
  walkAll,
  type CliSpec,
  type PyDate,
} from "./pycompat.ts";
import { no_route_opportunities } from "./build_skill_atlas_opportunities.ts";
import { render_html } from "./build_skill_atlas_layout.ts";
import { SKIP_PARTS, audit_workspace, asdict } from "./skill_style.ts";

const ROOT = pyResolve(path.join(import.meta.dir, ".."));
// Run state lives with the other agent ledgers (ccobs' ~/.claude/observability),
// never in the skill dir or CWD — the plugin repo is source, not a data store.
const STATE_DIR = pyOr(
  process.env.SKILL_ATLAS_DIR ?? "",
  path.join(pyHome(), ".claude", "observability", "skill-atlas"),
);
const IGNORE_PARTS = new Set([...SKIP_PARTS, ".previews"]);
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "for",
  "from",
  "with",
  "into",
  "skill",
  "skills",
  "agent",
  "reusable",
  "use",
  "when",
  "create",
  "turn",
]);
const CADENCE_DAYS: Record<string, number> = {
  monthly: 31,
  quarterly: 100,
  semiannual: 200,
  annual: 370,
  "per-release": 120,
};
const DEFAULT_SCOPE = {
  scope: "release",
  actionable: true,
  scope_reason: "default release-actionable skill",
};
const TELEMETRY_REQUIRED_MATURITIES = new Set(["production", "library", "governed"]);

const has = (o: any, k: string): boolean =>
  o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const get = (o: any, k: string, def: any = null): any => (has(o, k) ? o[k] : def);
const isDict = (v: any): boolean => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof PyFloat);

export function parse_frontmatter(p: string): [Record<string, any>, string] {
  const text = readTextReplace(p);
  const lines = pySplitLines(text);
  if (lines.length === 0 || pyStrip(lines[0]) !== "---") return [{}, text];
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIndex = i;
      break;
    }
  }
  if (endIndex < 0) return [{}, text];
  const fmLines = lines.slice(1, endIndex);
  const body = pyLstrip(lines.slice(endIndex + 1).join("\n"));
  const payload: Record<string, any> = {};
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    const first = line.slice(0, 1);
    if (first !== " " && first !== "\t" && line.includes(":")) {
      const colon = line.indexOf(":");
      const key = line.slice(0, colon);
      const value = pyStrip(line.slice(colon + 1));
      if (value === ">" || value === ">-" || value === "|" || value === "|-") {
        const block: string[] = [];
        i++;
        while (i < fmLines.length) {
          const fl = fmLines[i];
          const f0 = fl.slice(0, 1);
          if (f0 === " " || f0 === "\t" || !pyStrip(fl)) {
            if (pyStrip(fl)) block.push(pyStrip(fl));
            i++;
          } else break;
        }
        payload[pyStrip(key)] = block.join(" ");
        continue;
      }
      payload[pyStrip(key)] = stripChars(value, '"');
    }
    i++;
  }
  return [payload, body];
}

function load_json(p: string): Record<string, any> {
  if (!fs.existsSync(p)) return {};
  let payload: any;
  try {
    payload = pyJsonParse(readTextStrict(p));
  } catch {
    return {};
  }
  return isDict(payload) ? payload : {};
}

function load_scope_policy(workspaceRoot: string): Record<string, any> {
  const p = path.join(workspaceRoot, "skill-atlas", "policy.json");
  if (!fs.existsSync(p)) {
    return { present: false, path: safe_rel(workspaceRoot, p), rules: [] };
  }
  const payload = load_json(p);
  const rules = get(payload, "scope_rules", []);
  const disabled = get(payload, "disabled_checks", []);
  return {
    present: true,
    path: safe_rel(workspaceRoot, p),
    schema_version: pyStr(get(payload, "schema_version", "")),
    rules: Array.isArray(rules) ? rules : [],
    disabled_checks: Array.isArray(disabled) ? disabled.map((item: any) => pyStr(item)) : [],
  };
}

// Last commit date (YYYY-MM-DD) touching skillDir; "" when git or history is absent.
function git_last_commit_date(skillDir: string): string {
  const r = spawnSync("git", ["-C", skillDir, "log", "-1", "--format=%cs", "--", "."], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return r.status === 0 ? pyStrip(r.stdout ?? "") : "";
}

export function should_skip(p: string, root: string): boolean {
  const rel = path.relative(root, p);
  if (rel === ".." || rel.startsWith("../") || path.isAbsolute(rel)) return true;
  const parts = rel.split("/");
  if (parts.some((part) => IGNORE_PARTS.has(part))) return true;
  return parts.length >= 2 && parts[0] === "tests" && parts[1].startsWith("tmp");
}

export function find_skill_dirs(workspaceRoot: string): string[] {
  const root = pyResolve(workspaceRoot);
  const skillDirs: string[] = [];
  const matches = walkAll(root)
    .filter((p) => path.basename(p) === "SKILL.md")
    .sort();
  for (const skillMd of matches) {
    if (should_skip(skillMd, root)) continue;
    skillDirs.push(path.dirname(skillMd));
  }
  return skillDirs;
}

const TOKEN_RE = /[a-zA-Z0-9_\-\u4e00-\u9fff]{2,}/gu;

function tokens(text: string): Set<string> {
  const raw = text.toLowerCase().match(TOKEN_RE) ?? [];
  return new Set(raw.filter((item) => !STOPWORDS.has(item)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0.0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection++;
  const union = left.size + right.size - intersection;
  return intersection / union;
}

function safe_rel(root: string, p: string): string {
  return safeRelCompat(root, p);
}

function path_matches_prefix(relPath: string, prefix: string): boolean {
  const normalizedPath = stripChars(relPath, "/");
  const normalizedPrefix = stripChars(prefix, "/");
  if (!normalizedPrefix) return false;
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(normalizedPrefix + "/");
}

function scope_for_path(relPath: string, policy: Record<string, any>): Record<string, any> {
  for (const rule of get(policy, "rules", [])) {
    if (!isDict(rule)) continue;
    const prefix = pyStrip(pyStr(get(rule, "path_prefix", "")));
    if (!prefix || !path_matches_prefix(relPath, prefix)) continue;
    return {
      scope: pyStr(pyOr(get(rule, "scope"), "supporting")),
      actionable: pyTruthy(get(rule, "actionable", false)),
      scope_reason: pyStr(pyOr(get(rule, "reason"), `matched policy prefix ${prefix}`)),
    };
  }
  return { ...DEFAULT_SCOPE };
}

function display_path(p: string): string {
  return safeRelCompat(ROOT, p);
}

function resource_names(skillDir: string): string[] {
  const names: string[] = [];
  for (const folder of ["scripts", "references", "assets", "templates"]) {
    const target = path.join(skillDir, folder);
    if (!fs.existsSync(target)) continue;
    const all = walkAll(target).sort();
    for (const p of all) {
      const rel = path.relative(skillDir, p);
      if (rel.split("/").some((part) => IGNORE_PARTS.has(part))) continue;
      const suffix = (() => {
        const base = path.basename(p);
        const idx = base.lastIndexOf(".");
        return idx > 0 && idx < base.length - 1 ? base.slice(idx) : "";
      })();
      if (suffix === ".pyc" || suffix === ".pyo") continue;
      let isFile = false;
      let isSymlink = false;
      try {
        isFile = fs.statSync(p).isFile();
        isSymlink = fs.lstatSync(p).isSymbolicLink();
      } catch {
        continue;
      }
      if (isFile && !isSymlink) names.push(`${folder}/${path.basename(p)}`);
    }
  }
  return names;
}

function collect_skill(workspaceRoot: string, skillDir: string, policy: Record<string, any>): Record<string, any> {
  const [frontmatter] = parse_frontmatter(path.join(skillDir, "SKILL.md"));
  const manifest = load_json(path.join(skillDir, "manifest.json"));
  const name = pyStr(pyOr(pyOr(get(frontmatter, "name"), get(manifest, "name")), path.basename(skillDir)));
  const description = pyStr(pyOr(get(frontmatter, "description"), ""));
  const targets = get(manifest, "target_platforms", []);
  const relPath = safe_rel(workspaceRoot, skillDir);
  const scope = scope_for_path(relPath, policy);
  return {
    name,
    path: relPath,
    description,
    owner: pyStr(get(manifest, "owner", "")),
    version: pyStr(get(manifest, "version", "")),
    status: pyStr(get(manifest, "status", "")),
    maturity: pyStr(get(manifest, "maturity_tier", get(manifest, "skill_archetype", ""))),
    updated_at: pyOr(pyStr(get(manifest, "updated_at", "")), git_last_commit_date(skillDir)),
    review_cadence: pyStr(get(manifest, "review_cadence", "")),
    targets: Array.isArray(targets) ? targets.map((item) => pyStr(item)) : [],
    resources: resource_names(skillDir),
    token_set: [...tokens(description)].sort(),
    atlas_scope: scope["scope"],
    actionable: scope["actionable"],
    scope_reason: scope["scope_reason"],
  };
}

function load_telemetry_profile(
  workspaceRoot: string,
  skillDir: string,
  skill: Record<string, any>,
): [Record<string, any>, Array<Record<string, any>>] {
  const reportPath = path.join(skillDir, "reports", "adoption_drift_report.json");
  const relReport = safe_rel(workspaceRoot, reportPath);
  const maturity = pyStr(get(skill, "maturity", "")).toLowerCase();
  const reportPresent = fs.existsSync(reportPath);
  const telemetry: Record<string, any> = {
    report_present: reportPresent,
    report: relReport,
    risk_band: "missing",
    event_count: 0,
    adoption_sample_count: 0,
    adoption_rate: 0,
    candidate_count: 0,
  };
  const signals: Array<Record<string, any>> = [];
  if (!reportPresent) {
    if (pyTruthy(get(skill, "actionable")) && TELEMETRY_REQUIRED_MATURITIES.has(maturity)) {
      signals.push({
        name: skill["name"],
        path: skill["path"],
        source: relReport,
        risk_band: "no-data",
        signal_types: ["no telemetry"],
        recommendation:
          "Render adoption drift evidence or record a small metadata-only sample before release review.",
        actionable: pyTruthy(get(skill, "actionable")),
        scope: pyStr(get(skill, "atlas_scope", "")),
        summary: { event_count: 0, adoption_sample_count: 0 },
      });
    }
    return [telemetry, signals];
  }

  const payload = load_json(reportPath);
  const rawSummary = get(payload, "summary", {});
  const summary = isDict(rawSummary) ? rawSummary : {};
  let candidates = get(payload, "next_iteration_candidates", []);
  candidates = Array.isArray(candidates) ? candidates : [];
  const riskBand = pyStr(pyOr(get(summary, "risk_band"), "unknown"));
  telemetry["risk_band"] = riskBand;
  telemetry["event_count"] = pyInt(pyOr(get(summary, "event_count"), 0));
  telemetry["adoption_sample_count"] = pyInt(pyOr(get(summary, "adoption_sample_count"), 0));
  telemetry["adoption_rate"] = get(summary, "adoption_rate", 0);
  telemetry["candidate_count"] = candidates.length;

  const signalTypes: string[] = [];
  if (telemetry["event_count"] === 0 && TELEMETRY_REQUIRED_MATURITIES.has(maturity)) signalTypes.push("no telemetry");
  if (pyInt(pyOr(get(summary, "missed_trigger_count"), 0))) signalTypes.push("missed trigger");
  if (pyInt(pyOr(get(summary, "wrong_trigger_count"), 0))) signalTypes.push("wrong trigger");
  if (pyInt(pyOr(get(summary, "bad_output_count"), 0))) signalTypes.push("bad output");
  if (pyInt(pyOr(get(summary, "missing_resource_count"), 0))) signalTypes.push("missing resource");
  if (pyInt(pyOr(get(summary, "script_error_count"), 0))) signalTypes.push("script error");
  if (pyInt(pyOr(get(summary, "review_overdue_count"), 0))) signalTypes.push("review overdue");
  if ((riskBand === "medium" || riskBand === "high") && signalTypes.length === 0) {
    signalTypes.push("telemetry drift");
  }

  if (signalTypes.length > 0) {
    let recommendation = "Convert telemetry drift into eval, trust, or owner-review actions.";
    for (const candidate of candidates) {
      if (!isDict(candidate)) continue;
      if (signalTypes.includes(pyStr(get(candidate, "signal", "")))) {
        recommendation = pyStr(pyOr(get(candidate, "recommendation"), recommendation));
        break;
      }
    }
    signals.push({
      name: skill["name"],
      path: skill["path"],
      source: relReport,
      risk_band: riskBand,
      signal_types: signalTypes,
      recommendation,
      actionable: pyTruthy(get(skill, "actionable")),
      scope: pyStr(get(skill, "atlas_scope", "")),
      summary: {
        event_count: telemetry["event_count"],
        adoption_sample_count: telemetry["adoption_sample_count"],
        adoption_rate: telemetry["adoption_rate"],
        missed_trigger_count: pyInt(pyOr(get(summary, "missed_trigger_count"), 0)),
        wrong_trigger_count: pyInt(pyOr(get(summary, "wrong_trigger_count"), 0)),
        bad_output_count: pyInt(pyOr(get(summary, "bad_output_count"), 0)),
        missing_resource_count: pyInt(pyOr(get(summary, "missing_resource_count"), 0)),
        script_error_count: pyInt(pyOr(get(summary, "script_error_count"), 0)),
        review_overdue_count: pyInt(pyOr(get(summary, "review_overdue_count"), 0)),
      },
    });
  }
  return [telemetry, signals];
}

function route_overlap(
  skills: Array<Record<string, any>>,
  threshold: number,
): [Array<Record<string, any>>, Array<Record<string, any>>] {
  const rows: Array<Record<string, any>> = [];
  const collisions: Array<Record<string, any>> = [];
  for (let i = 0; i < skills.length; i++) {
    const left = skills[i];
    for (const right of skills.slice(i + 1)) {
      const score = round3(jaccard(new Set(left["token_set"]), new Set(right["token_set"])));
      const status = num(score) >= threshold ? "collision" : "clear";
      const row = {
        skill_a: left["name"],
        skill_b: right["name"],
        path_a: left["path"],
        path_b: right["path"],
        score,
        status,
        actionable: pyTruthy(get(left, "actionable")) && pyTruthy(get(right, "actionable")),
        scope_a: pyStr(get(left, "atlas_scope", "")),
        scope_b: pyStr(get(right, "atlas_scope", "")),
      };
      rows.push(row);
      if (status === "collision") collisions.push(row);
    }
  }
  const counts = new Map<string, number>();
  for (const item of skills) counts.set(item["name"], (counts.get(item["name"]) ?? 0) + 1);
  const duplicateNames: Array<{ name: string; paths: string[] }> = [];
  for (const [name, count] of counts) {
    if (count > 1) {
      duplicateNames.push({ name, paths: skills.filter((item) => item["name"] === name).map((item) => item["path"]) });
    }
  }
  for (const item of duplicateNames) {
    const firstTwo = new Set(item.paths.slice(0, 2));
    collisions.push({
      skill_a: item.name,
      skill_b: item.name,
      path_a: item.paths[0],
      path_b: item.paths[1],
      score: F(1.0),
      status: "duplicate-name",
      actionable: skills
        .filter((skill) => skill["name"] === item.name && firstTwo.has(skill["path"]))
        .every((skill) => pyTruthy(get(skill, "actionable"))),
      scope_a: pyStr(get(skills.find((skill) => skill["path"] === item.paths[0]) ?? {}, "atlas_scope", "")),
      scope_b: pyStr(get(skills.find((skill) => skill["path"] === item.paths[1]) ?? {}, "atlas_scope", "")),
    });
  }
  return [rows, collisions];
}

function dependency_graph(skills: Array<Record<string, any>>): Record<string, any> {
  const byResource = new Map<string, string[]>();
  for (const skill of skills) {
    for (const resource of get(skill, "resources", [])) {
      if (!byResource.has(resource)) byResource.set(resource, []);
      byResource.get(resource)!.push(skill["name"]);
    }
  }
  const shared = [...byResource.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .filter(([, names]) => new Set(names).size > 1)
    .map(([resource, names]) => ({ resource, skills: [...names].sort() }));
  return {
    nodes: skills.map((item) => ({ name: item["name"], path: item["path"] })),
    shared_resources: shared,
  };
}

function parse_date(value: string): PyDate | null {
  if (!value) return null;
  return parseDateYMD(pySlice(value, 10));
}

function stale_skills(skills: Array<Record<string, any>>, today: PyDate): Array<Record<string, any>> {
  const stale: Array<Record<string, any>> = [];
  for (const skill of skills) {
    const updated = parse_date(get(skill, "updated_at", ""));
    const cadence = pyOr(get(skill, "review_cadence"), "");
    const allowedDays = has(CADENCE_DAYS, cadence) ? CADENCE_DAYS[cadence] : 120;
    if (!updated) {
      stale.push({
        name: skill["name"],
        path: skill["path"],
        reason: "missing updated_at",
        actionable: pyTruthy(get(skill, "actionable")),
        scope: pyStr(get(skill, "atlas_scope", "")),
      });
      continue;
    }
    const age = daysBetween(today, updated);
    if (age > allowedDays) {
      stale.push({
        name: skill["name"],
        path: skill["path"],
        reason: `review overdue by cadence ${cadence || "unspecified"}`,
        age_days: age,
        allowed_days: allowedDays,
        actionable: pyTruthy(get(skill, "actionable")),
        scope: pyStr(get(skill, "atlas_scope", "")),
      });
    }
  }
  return stale;
}

function owner_review_gaps(skills: Array<Record<string, any>>): Array<Record<string, any>> {
  const gaps: Array<Record<string, any>> = [];
  for (const skill of skills) {
    const missing: string[] = [];
    if (!pyTruthy(get(skill, "owner"))) missing.push("owner");
    if (!pyTruthy(get(skill, "review_cadence"))) missing.push("review_cadence");
    if (!pyTruthy(get(skill, "maturity"))) missing.push("maturity");
    if (missing.length > 0) {
      gaps.push({
        name: skill["name"],
        path: skill["path"],
        missing,
        actionable: pyTruthy(get(skill, "actionable")),
        scope: pyStr(get(skill, "atlas_scope", "")),
      });
    }
  }
  return gaps;
}

function write_csv(p: string, rows: Array<Record<string, any>>): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fields = ["skill_a", "skill_b", "path_a", "path_b", "score", "status", "actionable", "scope_a", "scope_b"];
  let buffer = csvRow(fields);
  for (const row of rows) {
    buffer += csvRow(fields.map((field) => get(row, field, "")));
  }
  fs.writeFileSync(p, buffer, "utf-8");
}

export function build_atlas(
  workspaceRoot: string,
  outputDir: string,
  reportHtml: string,
  reportJson: string,
  threshold: number,
  today: PyDate,
): Record<string, any> {
  const root = pyResolve(workspaceRoot);
  const scopePolicy = load_scope_policy(root);
  const skillDirs = find_skill_dirs(root);
  const skills: Array<Record<string, any>> = [];
  const driftSignals: Array<Record<string, any>> = [];
  let telemetryReportCount = 0;
  for (const skillDir of skillDirs) {
    const skill = collect_skill(root, skillDir, scopePolicy);
    const [telemetry, signals] = load_telemetry_profile(root, skillDir, skill);
    skill["telemetry"] = telemetry;
    telemetryReportCount += telemetry["report_present"] ? 1 : 0;
    driftSignals.push(...signals);
    skills.push(skill);
  }
  const skillsByPath: Record<string, any> = {};
  for (const skill of skills) skillsByPath[skill["path"]] = skill;
  const styleIssues: Array<Record<string, any>> = [];
  for (const issue of audit_workspace(root, skillDirs)) {
    const item = asdict(issue);
    const skill = get(skillsByPath, issue.skill_path, {});
    item["actionable"] = pyTruthy(get(skill, "actionable", true));
    item["scope"] = pyStr(get(skill, "atlas_scope", "release"));
    styleIssues.push(item);
  }
  const [overlapRows, collisions] = route_overlap(skills, threshold);
  const graph = dependency_graph(skills);
  const disabledChecks = new Set<string>(get(scopePolicy, "disabled_checks", []) ?? []);
  const stale = disabledChecks.has("stale_skills") ? [] : stale_skills(skills, today);
  const ownerGaps = disabledChecks.has("owner_review_gaps") ? [] : owner_review_gaps(skills);
  const opportunities = no_route_opportunities(root, driftSignals, should_skip, safe_rel);
  const actionableSkills = skills.filter((skill) => pyTruthy(get(skill, "actionable")));
  const actionableCollisions = collisions.filter((item) => pyTruthy(get(item, "actionable")));
  const actionableStale = stale.filter((item) => pyTruthy(get(item, "actionable")));
  const actionableOwnerGaps = ownerGaps.filter((item) => pyTruthy(get(item, "actionable")));
  const actionableDriftSignals = driftSignals.filter((item) => pyTruthy(get(item, "actionable")));
  const actionableStyleIssues = styleIssues.filter((item) => pyTruthy(get(item, "actionable")));
  const actionableBlockerCount =
    styleIssues.length +
    actionableCollisions.length +
    actionableStale.length +
    actionableOwnerGaps.length +
    actionableDriftSignals.length;
  const summary = {
    skill_count: skills.length,
    actionable_skill_count: actionableSkills.length,
    route_collision_count: collisions.length,
    actionable_route_collision_count: actionableCollisions.length,
    owner_gap_count: ownerGaps.length,
    actionable_owner_gap_count: actionableOwnerGaps.length,
    stale_count: stale.length,
    actionable_stale_count: actionableStale.length,
    shared_resource_count: graph["shared_resources"].length,
    no_route_opportunity_count: opportunities.length,
    telemetry_report_count: telemetryReportCount,
    drift_signal_count: driftSignals.length,
    actionable_drift_signal_count: actionableDriftSignals.length,
    style_issue_count: styleIssues.length,
    actionable_style_issue_count: actionableStyleIssues.length,
    actionable_blocker_count: actionableBlockerCount,
    non_actionable_issue_count:
      collisions.length -
      actionableCollisions.length +
      (ownerGaps.length - actionableOwnerGaps.length) +
      (stale.length - actionableStale.length) +
      (driftSignals.length - actionableDriftSignals.length),
  };
  const catalog = {
    workspace_root: display_path(root),
    generated_at: isoDate(today),
    skills,
    summary,
  };
  const styleOk = styleIssues.length === 0;
  const portfolioOk = actionableBlockerCount === 0;
  const payload: Record<string, any> = {
    ok: portfolioOk,
    style_ok: styleOk,
    portfolio_ok: portfolioOk,
    workspace_root: display_path(root),
    summary,
    scope_policy: scopePolicy,
    catalog,
    route_collisions: collisions,
    actionable_route_collisions: actionableCollisions,
    dependency_graph: graph,
    stale_skills: stale,
    actionable_stale_skills: actionableStale,
    owner_review_gaps: ownerGaps,
    actionable_owner_review_gaps: actionableOwnerGaps,
    drift_signals: driftSignals,
    actionable_drift_signals: actionableDriftSignals,
    style_issues: styleIssues,
    actionable_style_issues: actionableStyleIssues,
    no_route_opportunities: opportunities,
    artifacts: {
      catalog: display_path(path.join(outputDir, "catalog.json")),
      route_overlap_matrix: display_path(path.join(outputDir, "route_overlap_matrix.csv")),
      dependency_graph: display_path(path.join(outputDir, "dependency_graph.json")),
      stale_skills: display_path(path.join(outputDir, "stale_skills.json")),
      owner_review_gaps: display_path(path.join(outputDir, "owner_review_gaps.json")),
      drift_signals: display_path(path.join(outputDir, "drift_signals.json")),
      style_issues: display_path(path.join(outputDir, "style_issues.json")),
      no_route_opportunities: display_path(path.join(outputDir, "no_route_opportunities.json")),
      report_json: display_path(reportJson),
      report_html: display_path(reportHtml),
    },
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "catalog.json"), pyJsonDumps(catalog) + "\n", "utf-8");
  write_csv(path.join(outputDir, "route_overlap_matrix.csv"), overlapRows);
  fs.writeFileSync(path.join(outputDir, "dependency_graph.json"), pyJsonDumps(graph) + "\n", "utf-8");
  fs.writeFileSync(path.join(outputDir, "stale_skills.json"), pyJsonDumps(stale) + "\n", "utf-8");
  fs.writeFileSync(path.join(outputDir, "owner_review_gaps.json"), pyJsonDumps(ownerGaps) + "\n", "utf-8");
  fs.writeFileSync(path.join(outputDir, "drift_signals.json"), pyJsonDumps(driftSignals) + "\n", "utf-8");
  fs.writeFileSync(path.join(outputDir, "style_issues.json"), pyJsonDumps(styleIssues) + "\n", "utf-8");
  fs.writeFileSync(
    path.join(outputDir, "no_route_opportunities.json"),
    pyJsonDumps(opportunities) + "\n",
    "utf-8",
  );
  fs.mkdirSync(path.dirname(reportJson), { recursive: true });
  fs.mkdirSync(path.dirname(reportHtml), { recursive: true });
  fs.writeFileSync(reportJson, pyJsonDumps(payload) + "\n", "utf-8");
  fs.writeFileSync(reportHtml, render_html(payload), "utf-8");
  return payload;
}

function main(): void {
  const spec: CliSpec = {
    prog: path.basename(process.argv[1] ?? "build_skill_atlas.ts"),
    description: "Build a Skill Atlas for a workspace of agent skills.",
    options: [
      { flag: "--workspace-root", dest: "workspace_root", kind: "store", type: "str", default: "." },
      { flag: "--output-dir", dest: "output_dir", kind: "store", type: "str", default: path.join(STATE_DIR, "atlas") },
      { flag: "--report-html", dest: "report_html", kind: "store", type: "str", default: path.join(STATE_DIR, "skill_atlas.html") },
      { flag: "--report-json", dest: "report_json", kind: "store", type: "str", default: path.join(STATE_DIR, "skill_atlas.json") },
      { flag: "--overlap-threshold", dest: "overlap_threshold", kind: "store", type: "float", default: F(0.42) },
      { flag: "--today", dest: "today", kind: "store", type: "str", default: isoDate(todayLocal()) },
      { flag: "--fail-on-style", dest: "fail_on_style", kind: "store_true" },
    ],
  };
  const args = parseCli(spec, process.argv.slice(2));
  const today = parseDateYMD(args.today);
  if (!today) {
    // datetime.strptime(args.today, "%Y-%m-%d") raised ValueError in Python.
    process.stderr.write(`ValueError: time data '${args.today}' does not match format '%Y-%m-%d'\n`);
    process.exit(1);
  }
  const payload = build_atlas(
    pyResolve(args.workspace_root),
    pyResolve(args.output_dir),
    pyResolve(args.report_html),
    pyResolve(args.report_json),
    num(args.overlap_threshold),
    today,
  );
  process.stdout.write(pyJsonDumps(payload) + "\n");
  if (args.fail_on_style && payload["style_issues"].length > 0) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
