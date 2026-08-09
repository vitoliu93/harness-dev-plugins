import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { classify, estimate_tokens, summarize } from "./context_sizer.ts";

describe("estimate_tokens", () => {
  test("empty string returns at least one", () => {
    expect(estimate_tokens("")).toBe(1);
  });

  test("short known strings", () => {
    expect(estimate_tokens("a")).toBe(1);
    expect(estimate_tokens("abcd")).toBe(1);
    expect(estimate_tokens("abcdefgh")).toBe(2);
  });

  test("longer string follows len div four", () => {
    expect(estimate_tokens("x".repeat(100))).toBe(25);
  });
});

describe("classify", () => {
  test("skill body", () => {
    expect(classify("SKILL.md")).toBe("skill_body");
  });

  test("reference and script kinds", () => {
    expect(classify("references/guide.md")).toBe("reference");
    expect(classify("scripts/run.py")).toBe("script");
  });

  test("agents classified as interface", () => {
    expect(classify("agents/helper.md")).toBe("interface");
  });
});

describe("summarize classification", () => {
  let skillDir: string;

  beforeEach(() => {
    skillDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-sizer-"));
  });

  afterEach(() => {
    fs.rmSync(skillDir, { recursive: true, force: true });
  });

  const _write = (rel: string, content: string): void => {
    const p = path.join(skillDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf-8");
  };

  test("directory walk assigns expected kinds", () => {
    _write("SKILL.md", "skill body text");
    _write("references/notes.md", "reference notes");
    _write("scripts/tool.py", "print('hi')");

    const report = summarize(skillDir);
    const kinds = Object.fromEntries(report["files"].map((entry: Record<string, any>) => [entry["path"], entry["kind"]]));

    expect(kinds["SKILL.md"]).toBe("skill_body");
    expect(kinds["references/notes.md"]).toBe("reference");
    expect(kinds["scripts/tool.py"]).toBe("script");
  });

  test("reference and script tokens count toward total not initial", () => {
    _write("SKILL.md", "a".repeat(40)); // 10 tokens
    _write("references/big.md", "b".repeat(400)); // 100 tokens
    _write("scripts/run.py", "c".repeat(200)); // 50 tokens

    const report = summarize(skillDir);

    expect(report["estimated_initial_load_tokens"]).toBe(10);
    expect(report["estimated_total_text_tokens"]).toBe(160);
  });
});

describe("warning threshold", () => {
  let skillDir: string;

  beforeEach(() => {
    skillDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-sizer-"));
  });

  afterEach(() => {
    fs.rmSync(skillDir, { recursive: true, force: true });
  });

  const _write = (rel: string, content: string): void => {
    const p = path.join(skillDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf-8");
  };

  test("no warning when initial load at threshold", () => {
    // 8000 chars -> 2000 tokens; warning triggers only when > 2000
    _write("SKILL.md", "x".repeat(8000));

    const report = summarize(skillDir);

    expect(report["estimated_initial_load_tokens"]).toBe(2000);
    expect(report["warning"]).toBe(false);
  });

  test("warning when initial load exceeds threshold", () => {
    // 8004 chars -> 2001 tokens
    _write("SKILL.md", "y".repeat(8004));

    const report = summarize(skillDir);

    expect(report["estimated_initial_load_tokens"]).toBe(2001);
    expect(report["warning"]).toBe(true);
  });

  test("agents tokens included in initial load warning", () => {
    _write("SKILL.md", "z".repeat(40)); // 10 tokens
    _write("agents/prompt.md", "a".repeat(8000)); // 2000 tokens

    const report = summarize(skillDir);

    expect(report["estimated_initial_load_tokens"]).toBe(2010);
    expect(report["warning"]).toBe(true);
  });
});
