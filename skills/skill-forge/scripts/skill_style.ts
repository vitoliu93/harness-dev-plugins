#!/usr/bin/env bun
// Deterministic style checks for runtime skill surfaces.
// Ported 1:1 from skill_style.py — findings feed the commit gate, so regex
// semantics (Python \b / \s / unicode word chars) are reproduced exactly.

import fs from "node:fs";
import path from "node:path";
import {
  PY_WS_CLASS,
  parseCli,
  pyJsonDumps,
  pyLen,
  pyResolve,
  pySlice,
  pySplitLines,
  pyStrip,
  readTextReplace,
  safeRel as safeRelCompat,
  stripChars,
  walkAll,
  type CliSpec,
} from "./pycompat.ts";

export const SKIP_PARTS = new Set([
  ".git",
  "__pycache__",
  "_archive",
  "archive",
  "dist",
  "evals",
  "node_modules",
  "reports",
  "skill_atlas",
  "tests",
  "venv",
  ".venv",
]);
const RUNTIME_DOC_DIRS = new Set(["references", "assets", "templates", "scripts", "agents"]);
const SKILL_SURFACE_DIRS = new Set([...RUNTIME_DOC_DIRS, "evals"]);
const PATH_SCAN_SUFFIXES = new Set([".md", ".json", ".py", ".sh", ".ts", ".js", ".mjs", ".yaml", ".yml"]);
const SELF_EXCLUDED_FILES = new Set(["skill_style.py"]);
const ALLOW_PATTERN = new RegExp(
  `style-lint:[${PY_WS_CLASS}]*allow[${PY_WS_CLASS}]+([a-z0-9_,-]+)[${PY_WS_CLASS}]+--[${PY_WS_CLASS}]+[^${PY_WS_CLASS}]+`,
  "i",
);

// Python \b after an ASCII word char == "next char is not a unicode word char".
const WB = `(?![\\p{L}\\p{N}_])`;
const WHEN_LINE = new RegExp(
  `^(?:Use when${WB}|Use before${WB}|Use after${WB}|Use for${WB}|Invoke when${WB}|` +
    `When .+ use${WB}|当.+时使用[。.]?$|在.+时使用[。.]?$|需要.+时使用[。.]?$|适用于.+)`,
  "iu",
);
const BAD_FIRST_LINE = new RegExp(
  `^(?:This skill${WB}|本[${PY_WS_CLASS}]*skill${WB}|这个[${PY_WS_CLASS}]*skill${WB}|Use when${WB}|Invoke when${WB}|当.+时使用)`,
  "u",
);

const LITERAL_PATTERNS: Array<[string, RegExp, string]> = [
  [
    "internal-ticket",
    /(?<![A-Z0-9])(?:IJ|IK)[A-Z0-9]{4,}(?![A-Z0-9])/,
    "Use a fictional placeholder unless runtime requires this exact external id.",
  ],
];

const LOCAL_PATH_PATTERNS: Array<[RegExp, string]> = [
  [
    new RegExp(`/Users/[A-Za-z0-9._-]+(?=/|[${PY_WS_CLASS}]|#|$)`),
    "Replace the user-specific absolute path with a skill/plugin root or configurable variable.",
  ],
  [
    new RegExp(`/home/[A-Za-z0-9._-]+(?=/|[${PY_WS_CLASS}]|#|$)`),
    "Replace the user-specific absolute path with a skill/plugin root or configurable variable.",
  ],
  [
    new RegExp(`~/(?:codebase|Documents|Downloads|Desktop|tmp)(?:/|${WB})`, "u"),
    "Use a named environment variable; a home-directory workspace is not portable.",
  ],
  [
    /<[A-Za-z0-9_-]+-base>\//,
    "Use a named repository-root variable or a remote repository reference.",
  ],
  [
    /\$\{?CLAUDE_SKILL_DIR\}?\/\.\.\//,
    "Do not assume a sibling skill path; resolve it from the plugin root or a named variable.",
  ],
];
const FIXED_RUNTIME_ID_PATTERNS: Array<[RegExp, string]> = [
  [
    new RegExp(
      `(?:workspace[_ -]?id|WORKSPACE_ID).{0,100}(?<![\\p{L}\\p{N}_])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}${WB}`,
      "iu",
    ),
    "Resolve workspace ids at runtime or accept them through a named environment variable.",
  ],
];

export interface StyleIssue {
  skill: string;
  skill_path: string;
  file: string;
  line: number;
  code: string;
  message: string;
  excerpt: string;
}

export const asdict = (issue: StyleIssue): Record<string, any> => ({
  skill: issue.skill,
  skill_path: issue.skill_path,
  file: issue.file,
  line: issue.line,
  code: issue.code,
  message: issue.message,
  excerpt: issue.excerpt,
});

/** pathlib Path.suffix: "" for dotfiles and trailing dots, else ".ext". */
function pySuffix(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 && idx < name.length - 1 ? name.slice(idx) : "";
}

function _safe_rel(root: string, p: string): string {
  return safeRelCompat(root, p);
}

function _allowed_codes(line: string): Set<string> {
  const match = ALLOW_PATTERN.exec(line);
  if (!match) return new Set();
  return new Set(match[1].split(",").map(pyStrip).filter((code) => code.length > 0));
}

function _frontmatter_description(p: string): [string[], number, string] {
  const lines = pySplitLines(readTextReplace(p));
  if (lines.length === 0 || pyStrip(lines[0]) !== "---") return [[], 1, "missing"];
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return [[], 1, "missing"];
  for (let index = 1; index < end; index++) {
    const line = lines[index];
    if (!line.startsWith("description:")) continue;
    const value = pyStrip(line.slice(line.indexOf(":") + 1));
    if (value !== ">-" && value !== ">" && value !== "|-" && value !== "|") {
      return [value ? [value] : [], index + 1, "inline"];
    }
    const content: string[] = [];
    let cursor = index + 1;
    while (cursor < end) {
      const first = lines[cursor].slice(0, 1);
      if (first === " " || first === "\t" || !pyStrip(lines[cursor])) {
        if (pyStrip(lines[cursor])) content.push(pyStrip(lines[cursor]));
        cursor++;
      } else break;
    }
    return [content, index + 1, value];
  }
  return [[], 1, "missing"];
}

function _skill_name(skillDir: string): string {
  const lines = pySplitLines(readTextReplace(path.join(skillDir, "SKILL.md")));
  for (const line of lines.slice(0, 40)) {
    if (line.startsWith("name:")) {
      return stripChars(pyStrip(line.slice(line.indexOf(":") + 1)), "\"'");
    }
  }
  return path.basename(skillDir);
}

export function find_skill_dirs(workspaceRoot: string): string[] {
  const result: string[] = [];
  const matches = walkAll(workspaceRoot)
    .filter((p) => path.basename(p) === "SKILL.md")
    .sort();
  for (const p of matches) {
    const rel = path.relative(workspaceRoot, p);
    if (rel.split("/").some((part) => SKIP_PARTS.has(part))) continue;
    result.push(path.dirname(p));
  }
  return result;
}

export function find_orphan_skill_dirs(workspaceRoot: string): string[] {
  const result = new Set<string>();
  const orphanSkipParts = new Set([...SKIP_PARTS].filter((part) => part !== "evals"));
  const all = walkAll(workspaceRoot).sort();
  for (const p of all) {
    let isFile = false;
    try {
      isFile = fs.statSync(p).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile || path.basename(p) === "SKILL.md") continue;
    const rel = path.relative(workspaceRoot, p);
    const relParts = rel.split("/");
    if (relParts.some((part) => orphanSkipParts.has(part))) continue;
    let candidate = path.dirname(p);
    for (let index = 0; index < relParts.length - 1; index++) {
      if (SKILL_SURFACE_DIRS.has(relParts[index])) {
        candidate = path.join(workspaceRoot, ...relParts.slice(0, index));
        break;
      }
    }
    if (candidate === workspaceRoot || fs.existsSync(path.join(candidate, "SKILL.md"))) continue;
    if (PATH_SCAN_SUFFIXES.has(pySuffix(path.basename(p))) || relParts.some((part) => SKILL_SURFACE_DIRS.has(part))) {
      result.add(candidate);
    }
  }
  return [...result].sort();
}

function* _runtime_doc_files(skillDir: string): Generator<string> {
  const top = fs
    .readdirSync(skillDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  for (const name of top) yield path.join(skillDir, name);
  for (const dirname of RUNTIME_DOC_DIRS) {
    const root = path.join(skillDir, dirname);
    if (!fs.existsSync(root)) continue;
    const matches = walkAll(root)
      .filter((p) => path.basename(p).endsWith(".md"))
      .sort();
    for (const p of matches) {
      const rel = path.relative(skillDir, p);
      if (!rel.split("/").some((part) => SKIP_PARTS.has(part))) yield p;
    }
  }
}

function* _runtime_path_files(skillDir: string): Generator<string> {
  const all = walkAll(skillDir).sort();
  for (const p of all) {
    let isFile = false;
    try {
      isFile = fs.statSync(p).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) continue;
    const name = path.basename(p);
    if (!PATH_SCAN_SUFFIXES.has(pySuffix(name))) continue;
    const rel = path.relative(skillDir, p);
    if (rel.split("/").some((part) => SKIP_PARTS.has(part))) continue;
    if (SELF_EXCLUDED_FILES.has(name) || name.startsWith("test_")) continue;
    yield p;
  }
}

function _issue(
  workspaceRoot: string,
  skillDir: string,
  skill: string,
  p: string,
  line: number,
  code: string,
  message: string,
  excerpt: string,
): StyleIssue {
  return {
    skill,
    skill_path: _safe_rel(workspaceRoot, skillDir),
    file: _safe_rel(workspaceRoot, p),
    line,
    code,
    message,
    excerpt: pySlice(pyStrip(excerpt), 240),
  };
}

function _description_issues(workspaceRoot: string, skillDir: string, skill: string): StyleIssue[] {
  const p = path.join(skillDir, "SKILL.md");
  const [content, line, style] = _frontmatter_description(p);
  const issues: StyleIssue[] = [];
  if (style !== ">-") {
    issues.push(
      _issue(
        workspaceRoot,
        skillDir,
        skill,
        p,
        line,
        "description-block",
        "Use a folded `description: >-` block.",
        `description style: ${style}`,
      ),
    );
  }
  if (content.length !== 2) {
    issues.push(
      _issue(
        workspaceRoot,
        skillDir,
        skill,
        p,
        line,
        "description-two-lines",
        "Write exactly two content lines: what it does, then when to use it.",
        content.join(" | "),
      ),
    );
    return issues;
  }
  if (BAD_FIRST_LINE.test(content[0])) {
    issues.push(
      _issue(
        workspaceRoot,
        skillDir,
        skill,
        p,
        line + 1,
        "description-action",
        "Start line 1 with the action; do not introduce or route the skill.",
        content[0],
      ),
    );
  }
  if (!WHEN_LINE.test(content[1])) {
    issues.push(
      _issue(
        workspaceRoot,
        skillDir,
        skill,
        p,
        line + 2,
        "description-when",
        "Start line 2 with an invocation phrase such as `Use when`, `Use before`, or `当…时使用`.",
        content[1],
      ),
    );
  }
  return issues;
}

function _doc_issues(workspaceRoot: string, skillDir: string, skill: string): StyleIssue[] {
  const issues: StyleIssue[] = [];
  const seen = new Set<string>();
  for (const p of _runtime_doc_files(skillDir)) {
    if (seen.has(p)) continue;
    seen.add(p);
    let inCode = false;
    let inFrontmatter = false;
    const lineLimit = path.basename(p) === "SKILL.md" ? 240 : 360;
    const lines = pySplitLines(readTextReplace(p));
    for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
      const line = lines[lineNo - 1];
      const stripped = pyStrip(line);
      if (path.basename(p) === "SKILL.md" && lineNo === 1 && stripped === "---") {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (stripped === "---") inFrontmatter = false;
        continue;
      }
      if (stripped.startsWith("```")) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;
      const allowed = _allowed_codes(line);
      for (const [code, pattern, message] of LITERAL_PATTERNS) {
        if (!allowed.has(code) && pattern.test(line)) {
          issues.push(_issue(workspaceRoot, skillDir, skill, p, lineNo, code, message, line));
        }
      }
      if (
        pyLen(stripped) > lineLimit &&
        !allowed.has("prose-wall") &&
        !stripped.startsWith("#") &&
        !stripped.startsWith("|") &&
        !stripped.startsWith("<!--") &&
        !/^\[[^\]]+\]:/.test(stripped)
      ) {
        issues.push(
          _issue(
            workspaceRoot,
            skillDir,
            skill,
            p,
            lineNo,
            "prose-wall",
            `Split this runtime prose line below ${lineLimit} characters.`,
            line,
          ),
        );
      }
    }
  }
  return issues;
}

function _is_comment_or_metadata(p: string, stripped: string): boolean {
  const suffix = pySuffix(path.basename(p));
  if (suffix === ".json" || suffix === ".yaml" || suffix === ".yml") return true;
  if (suffix === ".py" || suffix === ".sh") return stripped.startsWith("#");
  if (suffix === ".js" || suffix === ".mjs" || suffix === ".ts") {
    return stripped.startsWith("//") || stripped.startsWith("/*") || stripped.startsWith("*");
  }
  return false;
}

function _path_issues(workspaceRoot: string, skillDir: string, skill: string): StyleIssue[] {
  const issues: StyleIssue[] = [];
  for (const p of _runtime_path_files(skillDir)) {
    const lines = pySplitLines(readTextReplace(p));
    for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
      const line = lines[lineNo - 1];
      const stripped = pyStrip(line);
      const allowed = _allowed_codes(line);
      if (_is_comment_or_metadata(p, stripped)) {
        for (const [code, pattern, message] of LITERAL_PATTERNS) {
          if (!allowed.has(code) && pattern.test(line)) {
            issues.push(_issue(workspaceRoot, skillDir, skill, p, lineNo, code, message, line));
          }
        }
      }
      for (const [pattern, message] of LOCAL_PATH_PATTERNS) {
        if (!allowed.has("local-path") && pattern.test(line)) {
          issues.push(_issue(workspaceRoot, skillDir, skill, p, lineNo, "local-path", message, line));
        }
      }
      for (const [pattern, message] of FIXED_RUNTIME_ID_PATTERNS) {
        if (!allowed.has("fixed-runtime-id") && pattern.test(line)) {
          issues.push(_issue(workspaceRoot, skillDir, skill, p, lineNo, "fixed-runtime-id", message, line));
        }
      }
    }
  }
  return issues;
}

export function audit_skill(workspaceRoot: string, skillDir: string): StyleIssue[] {
  const skill = _skill_name(skillDir);
  return [
    ..._description_issues(workspaceRoot, skillDir, skill),
    ..._doc_issues(workspaceRoot, skillDir, skill),
    ..._path_issues(workspaceRoot, skillDir, skill),
  ];
}

export function audit_workspace(workspaceRoot: string, skillDirs?: Iterable<string>): StyleIssue[] {
  const root = pyResolve(workspaceRoot);
  const dirs = skillDirs !== undefined && skillDirs !== null ? [...skillDirs] : find_skill_dirs(root);
  const issues: StyleIssue[] = [];
  for (const skillDir of dirs) {
    issues.push(...audit_skill(root, pyResolve(skillDir)));
  }
  for (const orphan of find_orphan_skill_dirs(root)) {
    issues.push(
      _issue(
        root,
        orphan,
        path.basename(orphan),
        orphan,
        1,
        "missing-skill",
        "Add SKILL.md before shipping references, scripts, assets, or templates.",
        orphan,
      ),
    );
  }
  return issues.sort((a, b) => {
    if (a.skill_path !== b.skill_path) return a.skill_path < b.skill_path ? -1 : 1;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return 0;
  });
}

function main(): void {
  const spec: CliSpec = {
    prog: path.basename(process.argv[1] ?? "skill_style.ts"),
    description: "Lint runtime Skill & Doc Style contracts.",
    options: [
      { flag: "--workspace-root", dest: "workspace_root", kind: "store", type: "str", default: "." },
      { flag: "--json", dest: "json", kind: "store_true" },
      { flag: "--fail-on-issues", dest: "fail_on_issues", kind: "store_true" },
    ],
  };
  const args = parseCli(spec, process.argv.slice(2));

  const root = pyResolve(args.workspace_root);
  const issues = audit_workspace(root);
  const payload = {
    ok: issues.length === 0,
    workspace_root: root,
    skill_count: find_skill_dirs(root).length,
    issue_count: issues.length,
    issues: issues.map(asdict),
  };
  if (args.json) {
    process.stdout.write(pyJsonDumps(payload) + "\n");
  } else if (issues.length > 0) {
    for (const item of issues) {
      process.stdout.write(`${item.file}:${item.line}: ${item.code}: ${item.message}\n`);
    }
    process.stdout.write(`${issues.length} style issue(s)\n`);
  } else {
    process.stdout.write(`style clean: ${payload.skill_count} skill(s)\n`);
  }
  if (args.fail_on_issues && issues.length > 0) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
