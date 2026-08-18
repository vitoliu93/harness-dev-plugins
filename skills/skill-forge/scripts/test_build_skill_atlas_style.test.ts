import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { build_atlas } from "./build_skill_atlas.ts";

describe("build atlas style", () => {
  let tmp: string;
  let skills: string;
  let output: string;
  let reportJson: string;
  let reportHtml: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "build-atlas-"));
    skills = path.join(tmp, "skills");
    fs.mkdirSync(skills);
    output = path.join(tmp, "atlas");
    reportJson = path.join(tmp, "skill_atlas.json");
    reportHtml = path.join(tmp, "skill_atlas.html");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const _skill = (name: string, description: string[], body: string = "# Skill\n"): void => {
    const skillDir = path.join(skills, name);
    fs.mkdirSync(skillDir);
    const lines = ["---", `name: ${name}`, "description: >-"];
    lines.push(...description.map((line) => `  ${line}`));
    lines.push("---", "", body);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), lines.join("\n"), "utf-8");
    fs.writeFileSync(
      path.join(skillDir, "manifest.json"),
      JSON.stringify({
        name,
        owner: "test",
        maturity_tier: "incubating",
        review_cadence: "monthly",
        updated_at: "2026-08-05",
      }),
      "utf-8",
    );
  };

  const _build = () =>
    build_atlas(skills, output, reportHtml, reportJson, 0.42, { y: 2026, m: 8, d: 5 });

  test("style issues are actionable atlas findings", () => {
    _skill("bad", ["Run a task.", "Explain its origin.", "Use when the task is needed."], "Run `/Users/example/work/task.py`.\n");
    const policy = path.join(skills, "skill-atlas");
    fs.mkdirSync(policy);
    fs.writeFileSync(
      path.join(policy, "policy.json"),
      JSON.stringify({
        schema_version: "1",
        scope_rules: [
          {
            path_prefix: "bad",
            scope: "supporting",
            actionable: false,
          },
        ],
      }),
      "utf-8",
    );
    const payload = _build();
    expect(payload["ok"]).toBe(false);
    expect(payload["style_ok"]).toBe(false);
    expect(payload["summary"]["style_issue_count"]).toBeGreaterThanOrEqual(2);
    expect(payload["summary"]["actionable_style_issue_count"]).toBe(0);
    expect(payload["actionable_style_issues"]).toEqual([]);
    expect(fs.existsSync(path.join(output, "style_issues.json"))).toBe(true);
  });

  test("clean style keeps atlas ok", () => {
    _skill("clean", ["Run a task.", "Use when the task is needed."]);
    const payload = _build();
    expect(payload["ok"]).toBe(true);
    expect(payload["style_ok"]).toBe(true);
    expect(payload["summary"]["style_issue_count"]).toBe(0);
    expect(payload["style_issues"]).toEqual([]);
  });
});
