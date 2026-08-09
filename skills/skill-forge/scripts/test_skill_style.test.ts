import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { audit_workspace, find_skill_dirs } from "./skill_style.ts";

describe("skill style", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-style-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const _skill = (name: string, description: string[], body: string = "# Skill\n"): string => {
    const skillDir = path.join(root, name);
    fs.mkdirSync(skillDir, { recursive: true });
    const lines = ["---", `name: ${name}`, "description: >-"];
    lines.push(...description.map((line) => `  ${line}`));
    lines.push("---", "", body);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), lines.join("\n"), "utf-8");
    return skillDir;
  };

  const _codes = (): string[] => audit_workspace(root).map((issue) => issue.code);

  test("accepts english and chinese two line descriptions", () => {
    _skill("english", ["Audit runtime skill contracts.", "Use when reviewing or shipping skill changes."]);
    _skill("chinese", ["检查运行时技能契约。", "当创建、优化或发布技能时使用。"]);
    _skill("invoke", ["Audit a skill fleet.", "Invoke when a fleet-wide review is required."]);
    _skill("applicable", ["审计技能舰队。", "适用于全量技能检查。"]);
    expect(audit_workspace(root)).toEqual([]);
  });

  test("rejects description shape and missing when line", () => {
    _skill("three-lines", ["Create a skill.", "Explain implementation detail.", "Use when authoring skills."]);
    _skill("missing-when", ["Create a skill.", "For skill authors."]);
    const codes = _codes();
    expect(codes).toContain("description-two-lines");
    expect(codes).toContain("description-when");
  });

  test("flags internal id local path and fixed runtime id", () => {
    const skillDir = _skill("bad-runtime", ["Run an operation.", "Use when the operation is required."]);
    const reference = path.join(skillDir, "references", "guide.md");
    fs.mkdirSync(path.dirname(reference));
    fs.writeFileSync(
      reference,
      "Task IJAB12 failed.\n" +
        "Run `/Users/example/codebase/tool.py` after that.\n" +
        "Set workspace_id=12345678-1234-1234-1234-123456789abc.\n",
      "utf-8",
    );
    const codes = _codes();
    expect(codes).toContain("internal-ticket");
    expect(codes).toContain("local-path");
    expect(codes).toContain("fixed-runtime-id");
  });

  test("flags prose wall and fixed sibling skill path", () => {
    const skillDir = _skill(
      "wall",
      ["Run a compact workflow.", "Use when a compact workflow is needed."],
      "This " + "very long runtime instruction ".repeat(20),
    );
    const script = path.join(skillDir, "scripts", "run.sh");
    fs.mkdirSync(path.dirname(script));
    fs.writeFileSync(script, 'python3 "${CLAUDE_SKILL_DIR}/../other-skill/scripts/run.py"\n', "utf-8");
    const codes = _codes();
    expect(codes).toContain("prose-wall");
    expect(codes).toContain("local-path");
  });

  test("leaves semantic narrative and marketing judgment to llm review", () => {
    const skillDir = _skill("extra-docs", ["Run a documented workflow.", "Use when the workflow is needed."]);
    fs.writeFileSync(path.join(skillDir, "call-site.md"), "历史教训：不要这样做。\n", "utf-8");
    const scripts = path.join(skillDir, "scripts");
    fs.mkdirSync(scripts);
    fs.writeFileSync(path.join(scripts, "guide.md"), "Use this 一站式 command.\n", "utf-8");
    expect(_codes()).toEqual([]);
  });

  test("flags user path without trailing slash", () => {
    const skillDir = _skill("short-path", ["Run a portable workflow.", "Use when portability matters."]);
    fs.writeFileSync(path.join(skillDir, "run.sh"), "cd /Users/example\n", "utf-8");
    const reference = path.join(skillDir, "references", "command.md");
    fs.mkdirSync(path.dirname(reference));
    fs.writeFileSync(reference, "```bash\ncd /Users/other # developer shortcut\n```\n", "utf-8");
    expect(_codes()).toContain("local-path");
  });

  test("skips frontmatter for prose wall checks", () => {
    const skillDir = path.join(root, "frontmatter");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: frontmatter\ndescription: >-\n" +
        "  Run a workflow.\n  Use when the workflow is needed.\n" +
        `metadata: ${"x".repeat(400)}\n---\n\n# Skill\n`,
      "utf-8",
    );
    expect(_codes()).not.toContain("prose-wall");
  });

  test("flags orphan runtime surface", () => {
    const orphan = path.join(root, "orphan", "scripts");
    fs.mkdirSync(orphan, { recursive: true });
    fs.writeFileSync(path.join(orphan, "run.sh"), "echo ok\n", "utf-8");
    const nestedSkill = path.join(root, "mixed", "child");
    fs.mkdirSync(nestedSkill, { recursive: true });
    fs.writeFileSync(
      path.join(nestedSkill, "SKILL.md"),
      "---\nname: child\ndescription: >-\n" +
        "  Run a child workflow.\n  Use when the child workflow is needed.\n---\n",
      "utf-8",
    );
    const mixedScripts = path.join(root, "mixed", "scripts");
    fs.mkdirSync(mixedScripts);
    fs.writeFileSync(path.join(mixedScripts, "run.sh"), "echo mixed\n", "utf-8");
    const evals = path.join(root, "eval-only", "evals");
    fs.mkdirSync(evals, { recursive: true });
    fs.writeFileSync(path.join(evals, "trigger_cases.json"), "{}\n", "utf-8");
    expect(_codes().filter((code) => code === "missing-skill").length).toBeGreaterThanOrEqual(3);
  });

  test("allows reasoned same line exception", () => {
    const skillDir = _skill("exception", ["Document a negative example.", "Use when explaining a rejected pattern."]);
    const reference = path.join(skillDir, "references", "negative.md");
    fs.mkdirSync(path.dirname(reference));
    fs.writeFileSync(
      reference,
      "```bash\n" + "cd /Users/example # style-lint: allow local-path -- negative example only\n" + "```\n",
      "utf-8",
    );
    expect(audit_workspace(root)).toEqual([]);
  });

  test("rejects unreasoned or wildcard exception", () => {
    const skillDir = _skill("bad-exception", ["Document rejected patterns.", "Use when explaining rejected patterns."]);
    const reference = path.join(skillDir, "references", "negative.md");
    fs.mkdirSync(path.dirname(reference));
    fs.writeFileSync(
      reference,
      "cd /Users/example # style-lint: allow local-path\n" + "cd /Users/other # style-lint: allow * -- too broad\n",
      "utf-8",
    );
    const issues = audit_workspace(root).filter((issue) => issue.code === "local-path");
    expect(issues).toHaveLength(2);
  });

  test("ignores eval fixtures and archived skills", () => {
    const skillDir = _skill("clean", ["Run a clean workflow.", "Use when the clean workflow is needed."]);
    const evals = path.join(skillDir, "evals");
    fs.mkdirSync(evals);
    fs.writeFileSync(path.join(evals, "trigger_cases.json"), '{"prompt": "复盘历史教训 IJAB12"}\n', "utf-8");
    const archived = path.join(root, "_archive", "old");
    fs.mkdirSync(archived, { recursive: true });
    fs.writeFileSync(path.join(archived, "SKILL.md"), "not valid", "utf-8");
    expect(find_skill_dirs(root)).toEqual([skillDir]);
    expect(audit_workspace(root)).toEqual([]);
  });

  test("accepts configurable and standard tool paths", () => {
    const skillDir = _skill("portable", ["Run a portable workflow.", "Use when portable execution is required."]);
    const reference = path.join(skillDir, "references", "paths.md");
    fs.mkdirSync(path.dirname(reference));
    fs.writeFileSync(
      reference,
      "Use `${CLAUDE_PLUGIN_ROOT}/skills/portable/scripts/run.py`.\n" +
        "Set `CACHE=${CACHE_DIR:-$HOME/.cache/portable}`.\n",
      "utf-8",
    );
    expect(audit_workspace(root)).toEqual([]);
  });
});
